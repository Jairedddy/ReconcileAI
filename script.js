import { render, html } from "https://cdn.jsdelivr.net/npm/lit-html@3/+esm";
import { csvParse } from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

const $login = document.querySelector("#login");
const $output = document.querySelector("#output");

const summaryMapping = ["Domicile", "Available for Sale"];

const fieldMapping = [
  // Add your field mappings here
  {
    fieldName: "AMC",
    externalField: "AMC (M* Management Fee)",
    internalField: "AMC",
  },
  {
    fieldName: "Available for Sale",
    externalField: "Country Available for Sale",
    internalField: "SELLING_FOR_COUNTRY",
  },
  {
    fieldName: "Domicile",
    externalField: "Domicile",
    internalField: "domicile",
  },
  {
    fieldName: "Fund Currency",
    externalField: "Fund Currency (M* Portfolio Currency)",
    internalField: "FundCurrency",
  },
  {
    fieldName: "Fund Name",
    externalField: "Fund Name (M* Fund Legal Name)",
    internalField: "Fund_Name",
  },
  {
    fieldName: "Investment Objective",
    externalField: "Investment Objective (M* KIID Objective/Investment Policy)",
    internalField: "Objective",
  },
  {
    fieldName: "Launch Date",
    externalField: "Launch Date (M* Inception Date)",
    internalField: "launch_date",
  },
  {
    fieldName: "Legal Structure",
    externalField: "Fund Legal Structure",
    internalField: "legal_structure",
  },
  {
    fieldName: "Share Class Currency",
    externalField: "Share Class Currency (M* Base Currency)",
    internalField: "ShareClassCurrency",
  },
  {
    fieldName: "Share Class Name",
    externalField: "Share Class Name (M* Name)",
    internalField: "ShareClassName",
  },
  {
    fieldName: "Umbrella",
    externalField: "Umbrella",
    internalField: "Umbrella Name",
  },
];

let llmFoundryToken;
// State to track current page and view type
let isDetailedView = false;
let currentPage = 1;
const rowsPerPage = 10;

const loader = html`<div class="d-flex justify-content-center">
  <div class="spinner-border" role="status">
    <span class="visually-hidden">Loading...</span>
  </div>
</div>`;

const formTemplate = html`<h2 class="text-center">Data Reconcilation Tool</h2>

  <!-- Static Section for File Uploads and Input -->
  <form id="upload-form">
    <!-- Centered Reconcile Button -->
    <div class="text-center mt-2">
      <button type="button" class="btn" style="background-color: #7F7F7F; color: white;" id="compareButton">Reconcile</button>
    </div>
    <!-- ISIN Input Field -->
    <label for="isinInput">Enter ISIN numbers (comma-separated):</label>
    <input type="text" id="isinInput" class="form-control"/>
    </div>
  </form>

  <!-- Dynamic Report Table -->
  <div id="report-section" class="mt-5"></div>`;

const initializeApp = async () => {
  // Set the default theme to light
  document.body.classList.remove('bg-dark'); // Ensure dark theme is removed
  document.body.classList.add('bg-light'); // Optionally add light theme class if needed

  try {
    const response = await fetch("https://llmfoundry.straive.com/token", { credentials: "include" });
    console.log(response);
    const { token } = await response.json();
    llmFoundryToken = token;
    console.log(token)
    if (!llmFoundryToken) {
      const loginUrl = "https://llmfoundry.straive.com/login?" + new URLSearchParams({ next: location.href });
      render(
        html`<div class="text-center my-5">
          <a class="btn btn-primary btn-lg" href="${loginUrl}">Log into LLM Foundry to use this app</a>
        </div>`,
        $login,
      );
    } else {
      render(formTemplate, $output);
      // const defaultISINs = "AU0000044828, AU0000169229, GB0001920486, GB0001990497, IE0000OEM636"; // Store default ISINs
      // document.getElementById("isinInput").value = defaultISINs; // Set input field to blank
      setupEventListeners();
    }
  } catch (error) {
    console.error("Error fetching token:", error);
  }
};

// Function to get AI suggestions from LLM Foundry
const getAISuggestion = async (internalValue, externalValue) => {
  try {
    const systemPrompt =
      "You are an AI that helps compare values. Given two values, determine if they are the same or different and provide a reason for your assessment. Respond with a JSON object containing 'status' and 'reason'.";

    const response = await fetch("https://llmfoundry.straive.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${llmFoundryToken}:datacomparison` },
      credentials: "include",
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `You are a Finance Analyst at an Investment firm. You are reconciling the data.
            Compare the text and check if they are similar. Check by the intent and not literal meaning.
            Text might not be completely similar or may have extra information, but it may convey the same meaning.

            Internal Value: ${internalValue}
            External Value: ${externalValue}

            Provide a JSON response with 'status' (true if the values are the same as, false if different) and 'reason' (slick and short reason for the provided status. The reason should not exceed 10-12 words.).`,
          },
        ],
      }),
    });

    const result = await response.json();
    // Ensure response is properly formatted
    if (result.choices && result.choices.length > 0) {
      try {
        const aiResponse = JSON.parse(result.choices[0].message.content.replace(/```json|```/g, "").trim());
        return aiResponse;
      } catch (error) {
        console.error("Error parsing AI response:", error);
        return { status: "Error", reason: "Invalid response format from AI" };
      }
    } else {
      return { status: "Error", reason: "No response content from AI" };
    }
  } catch (error) {
    console.error("Error getting AI suggestion:", error);
    return { status: "Error", reason: "Failed to get response from AI" };
  }
};

const downloadCSV = (data) => {
  const rows = [["ISIN", "Field Name", "Internal Value", "External Value", "Status", "AI Status", "AI Reason"]];

  data.forEach((row) => {
    let status = "";
    if (row.matched === true) {
      status = "Matched";
    } else if (row.matched === false) {
      status = "Not Matched";
    } else if (row.matched === "resolved") {
      status = "Resolved";
    }

    // Wrap AI reason in double quotes to prevent it from spreading across multiple columns
    const aiReason = row.aiSuggestion?.reason ? `"${row.aiSuggestion?.reason.replace(/"/g, '""')}"` : "";

    rows.push([
      row.isin || "",
      row.fieldName || "",
      row.internalValue || "",
      row.externalValue || "",
      status,
      row.aiSuggestion?.status ? "Matched" : "Not Matched",
      aiReason,
    ]);
  });

  const csvContent = rows.map((e) => e.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

  // Create a link element, use it to generate the download, and remove it
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "report.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

const setupEventListeners = () => {
  // Event listeners for file input changes
  // document.getElementById("internalFile").addEventListener("change", checkFilesUploaded);
  // document.getElementById("externalFile").addEventListener("change", checkFilesUploaded);

  document.querySelector("#compareButton").addEventListener("click", compareISIN);
  // Add event listener for the "Enter" key on the form
  document.querySelector("#upload-form").addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      compareISIN();
    }
  });
};

// Function to update the output using lit-html
const updateReportTable = (reportData, section) => {
  console.log("Report Data:", reportData); // Check if reportData is available
  // Function to change view
  const toggleView = () => {
    isDetailedView = !isDetailedView;
    updateTableView(reportData);
  };

  // Function to change page
  const changePage = (page) => {
    if (page < 1 || page > Math.ceil(reportData.length / rowsPerPage)) return;
    currentPage = page;
    updateTableView(reportData);
  };

  // Function to calculate total number of passed and failed comparisons
  const calculateComparisonStats = (passCount = false) => {
    return passCount
      ? reportData.filter((data) => data.matched === true).length
      : reportData.filter((data) => !data.matched).length;
  };

  // Function to update table view
  const updateTableView = (curReportData) => {
    // Paginate data for current page
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const paginatedData = curReportData.slice(start, end);

    // Truncate function to limit text length
    const truncate = (text) => (text?.length > 200 ? text?.substring(0, 190) + "..." : text);

    // Template for detailed table view
    const detailedTableTemplate = html`
      <div class="d-flex align-items-center justify-content-between">
        <h3 class="lead">Recon Report</h3>
        <div>
          <button
            class="btn btn-secondary mb-3"
            @click=${toggleView}
            title="Toggle View"
          >
            ${isDetailedView ? "Recon Summary" : "Recon Report"}
          </button>
          <button class="btn btn-secondary mb-3" @click=${() => downloadCSV(curReportData)} title="Download CSV">
            <i class="bi bi-download"></i>
          </button>
        </div>
      </div>
      <div class="table-container" style="position: relative;">
        <table class="table table-striped table-hover rounded-3" id="reportTable">
          <thead class="thead-light bg-light">
            <tr>
              <th class="text-nowrap">ISIN</th>
              <th class="text-nowrap">Field Name</th>
              <th class="text-nowrap">Internal Value</th>
              <th class="text-nowrap">External Value</th>
              <th class="text-nowrap">Status</th>
              <th class="text-nowrap">AI Status</th>
              <th class="text-nowrap">AI Reason</th>
              <th class="text-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${paginatedData.map((row) => {
              if (row.matched !== "resolved") {
                return html`
                  <tr id="row-${row.id}">
                    <td title="${row.isin}">${truncate(row.isin)}</td>
                    <td title="${row.fieldName}">${truncate(row.fieldName)}</td>
                    <td title="${row.internalValue}">${truncate(row.internalValue)}</td>
                    <td title="${row.externalValue}">${truncate(row.externalValue)}</td>
                    <td class="text-center">
                      ${row.matched
                        ? html`<i class="bi bi-check-circle text-success" title="Matched"></i>`
                        : html`<i class="bi bi-x-circle text-danger" title="Not Matched"></i>`}
                    </td>
                    <td class="text-center" title="${row.aiSuggestion?.reason}">
                      ${row.aiSuggestion?.status === "-"
                        ? html`<span class="text-muted">${row.aiSuggestion?.status}</span>`
                        : row.aiSuggestion?.status
                          ? html`<i class="bi bi-check-circle text-success" title="AI Suggestion Approved"></i>`
                          : html`<i class="bi bi-x-circle text-danger" title="AI Suggestion Rejected"></i>`}
                    </td>
                    <td title="${row.aiSuggestion?.reason}" class="text-muted">${truncate(row.aiSuggestion?.reason)}</td>
                    <td class="text-center">
                      ${!row.matched
                        ? html`<button
                            type="button"
                            class="btn btn-secondary btn-sm text-nowrap"
                            @click=${() => resolveRow(row.id, curReportData)}
                          >
                            <i class="bi bi-check-circle"></i> Resolve
                          </button>`
                        : html`<span class="text-muted">-</span>`}
                    </td>
                  </tr>
                `;
              }
            })}
          </tbody>
        </table>
      </div>
    `;

    // Template for summary table view with all details displayed at once
    const summaryTableTemplate = html`
      <div class="d-flex align-items-center justify-content-between">
        <h3 class="lead">Summary Report</h3>
        <div>
          <button
            class="btn btn-secondary mb-3"
            @click=${toggleView}
            title="Toggle View"
          >
            ${isDetailedView ? "Recon Summary" : "Recon Report"}
          </button>
          <button class="btn btn-secondary mb-3" @click=${() => downloadCSV(curReportData)} title="Download CSV">
            <i class="bi bi-download"></i>
          </button>
        </div>
      </div>
      <div class="d-flex justify-content-between">
        <h4 class="small">Passed: <span>${calculateComparisonStats(true)}</span></h4>
        <h4 class="small">Failed: <span>${calculateComparisonStats()}</span></h4>
      </div>
      <table class="table table-striped table-hover rounded-3">
        <thead class="thead-light bg-light">
          <tr>
            <th class="text-nowrap">Category</th>
            <th class="text-nowrap">Internal Value</th>
            <th class="text-nowrap">External Value</th>
            <th class="text-nowrap">Count</th>
            <th class="text-nowrap">Action</th>
          </tr>
        </thead>
        <tbody>
          ${summaryMapping.flatMap((category) => {
            console.log("Processing category:", category); // Check category processing
            const categoryRows = curReportData.filter(
              (row) => row.fieldName === category && row.internalValue !== row.externalValue,
            );
            // Count occurrences of each issue within the category
            const issueCounts = categoryRows.reduce((acc, row) => {
              const issueKey = `${row.internalValue}-${row.externalValue}`;
              acc[issueKey] = (acc[issueKey] || 0) + 1;
              return acc;
            }, {});

            if (categoryRows.length === 0) {
              return []; // No rows to display for this category
            }
            const uniqueCategoryRows = Array.from(
              new Map(categoryRows.map(row => [`${row.internalValue}-${row.externalValue}`, row])).values()
            );

            return [
              html`
                <tr>
                  <td class="font-weight-bold">${category}</td>
                  <td colspan="4"></td>
                </tr>
              `,
              ...uniqueCategoryRows.map(
                (row) => html`
                  <tr>
                    <td></td>
                    <td>${row.internalValue}</td>
                    <td>${row.externalValue}</td>
                    <td>${issueCounts[`${row.internalValue}-${row.externalValue}`]}</td>
                    <td class="text-center">
                      ${!row.matched
                        ? html`<button
                            type="button"
                            class="btn btn-secondary btn-sm text-nowrap"
                            @click=${() =>
                              resolveSimilarRows(curReportData, category, row.internalValue, row.externalValue)}
                          >
                            <i class="bi bi-check-circle"></i> Resolve All
                          </button>`
                        : html`<span class="text-muted">-</span>`}
                    </td>
                  </tr>
                `,
              ),
            ];
          })}
        </tbody>
      </table>
    `;

    // Pagination template
    const paginationTemplate = html`
      <nav aria-label="Page navigation">
        <ul class="pagination justify-content-center">
          <li class="page-item ${currentPage === 1 ? "disabled" : ""}">
            <button class="page-link" @click=${() => changePage(currentPage - 1)}>
              <i class="bi bi-chevron-left"></i> Previous
            </button>
          </li>
          ${Array.from({ length: Math.ceil(curReportData.length / rowsPerPage) }, (_, index) => index + 1).map(
            (page) => html`
              <li class="page-item ${currentPage === page ? "active" : ""}">
                <button class="page-link" @click=${() => changePage(page)}>${page}</button>
              </li>
            `,
          )}
          <li class="page-item ${currentPage === Math.ceil(curReportData.length / rowsPerPage) ? "disabled" : ""}">
            <button class="page-link" @click=${() => changePage(currentPage + 1)}>
              Next <i class="bi bi-chevron-right"></i>
            </button>
          </li>
        </ul>
      </nav>
    `;

    // Render the appropriate view
    if (!isDetailedView) {
      render(html`${summaryTableTemplate}`, section);
    } else {
      render(html`${detailedTableTemplate} ${curReportData.length > rowsPerPage ? paginationTemplate : ""}`, section);
    }
  };    
  // Initialize the table view
  updateTableView(reportData);
};

// Function to resolve a row
const resolveSimilarRows = (currentData, category, curIntValue, curExtValue) => {
  const updatedData = currentData.map((data) => {
    const isResolved =
      data.internalValue === curIntValue && data.externalValue === curExtValue && data.fieldName === category;

    // If resolved, return the updated object with matched set to "resolved", otherwise return the original object
    return isResolved ? { ...data, matched: "resolved" } : data;
  });
  updateReportTable(updatedData, document.querySelector("#report-section"));
};

// Function to resolve all similar rows
const resolveRow = (id, currentData) => {
  const updatedData = currentData.map((data) => {
    if (data.id === id) {
      data.matched = "resolved";
    }
    return data;
  });
  updateReportTable(updatedData, document.querySelector("#report-section"));
};

// Define default file paths for multiple internal and external files
const defaultInternalFilePaths = [
  './internal_files/JHI_Fund_Ref_Data.csv',
  './internal_files/JHI_PortfolioManagers.csv',
  './internal_files/JHI_Price_Aum.csv',
  './internal_files/JHI_RatingsCharges.csv',
]; // Update with actual paths

const defaultExternalFilePaths = [
  './external_files/Morningstar AMC.csv', 
  './external_files/Morningstar Available for Sale.csv', 
  './external_files/Morningstar Domicile, Fund Currency, Share Class Currency, Share Class Name, Fund Name.csv', 
  './external_files/Morningstar Investment Objective.csv', 
  './external_files/Morningstar Launch Date.csv', 
  './external_files/Morningstar UCITS KIID Ongoing Charge and UCITS KIID Ongoing Charge As At Date.csv', 
  './external_files/Morningstar Umbrella and Legal Structure.csv', 
]; // Update with actual paths

// Declare a global variable to hold the final report data
let finalReportData = [];

// Declare the compareISIN function in the global scope
window.compareISIN = async () => {
  const $reportSection = document.querySelector("#report-section");
  render(loader, $reportSection);

  const internalFiles = await loadDefaultFiles(defaultInternalFilePaths);
  const externalFiles = await loadDefaultFiles(defaultExternalFilePaths);
  console.log(internalFiles);
  console.log(externalFiles)

  const isinInput = document.querySelector("#isinInput").value;
  const defaultISINs = "AU0000044828, AU0000169229, GB0001920486, GB0001990497, IE0000OEM636"; // Default ISINs
  const isinList = isinInput.trim() === "" ? defaultISINs.split(",").map((isin) => isin.trim()) : isinInput.split(",").map((isin) => isin.trim());
  console.log(isinList);

  let internalData = {};
  let externalData = {};

  const internalIsinKey = "ClassIdentifier"; // Replace this with the actual key name in internal data
  const externalIsinKey = "ISIN"; // Key name in external data

  // Function to process files
  const processInternalFiles = Array.from(internalFiles).map((file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const data = csvParse(reader.result);
        data.forEach((row) => {
          const internalIsinValue = row[internalIsinKey]?.trim();
          if (isinList.includes(internalIsinValue)) {
            if (!internalData[internalIsinValue]) {
              internalData[internalIsinValue] = {}; // Initialize if not present
            }

            // Merge fields from the current file into the existing internalData entry
            Object.keys(row).forEach((rawField) => {
              const field = rawField.replace(/,+$/, "").replace(/,,+/g, ",");
              let value = row[rawField]?.trim();
              if (value === '""') value = ""; // Convert "\"\"" to empty string
              if (value) value = value.replace(/,+$/, "").replace(/,,+/g, ",");
              if (value || value === "") internalData[internalIsinValue][field] = value;
            });
          }
        });
        resolve();
      };
      reader.readAsText(file);
    });
  });

  // Process external files
  const processExternalFiles = Array.from(externalFiles).map((file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const data = csvParse(reader.result);
        data.forEach((row) => {
          const externalIsinValue = row[externalIsinKey]?.trim();
          if (isinList.includes(externalIsinValue)) {
            if (!externalData[externalIsinValue]) {
              externalData[externalIsinValue] = {}; // Initialize if not present
            }

            // Merge fields from the current file into the existing externalData entry
            Object.keys(row).forEach((field) => {
              if (row[field]) externalData[externalIsinValue][field] = row[field].trim();
            });
          }
        });
        resolve();
      };
      reader.readAsText(file);
    });
  });

  // Compare ISIN after processing all files
  Promise.all([...processInternalFiles, ...processExternalFiles]).then(async () => {
    let reportData = [];
    let entryId = 1;

    // Iterate through the ISIN list to generate the report
    for (const isin of isinList) {
      const internalRow = internalData[isin] || {};
      const externalRow = externalData[isin] || {};

      for (const mapping of fieldMapping) {
        const { fieldName, externalField, internalField } = mapping;
        let internalValue = internalRow[internalField] || "N/A";
        let externalValue = externalRow[externalField] || "N/A";

        // Normalize numerical values
        const normalizeValue = (value) => {
          const numValue = parseFloat(value);
          return isNaN(numValue) ? value : numValue;
        };

        const normalizedInternalValue = normalizeValue(internalValue);
        const normalizedExternalValue = normalizeValue(externalValue);
        const matched = normalizedInternalValue === normalizedExternalValue;

        // Call AI suggestion only if values are not matching
        let aiSuggestion = { status: "-", reason: "-" };
        if (!matched) {
          aiSuggestion = await getAISuggestion(internalValue, externalValue);
        }

        reportData.push({
          id: entryId++,
          isin,
          fieldName,
          internalValue,
          externalValue,
          matched,
          aiSuggestion,
        });
      }
    }

    // Update the global variable with the report data
    finalReportData = reportData; // Store the report data in the global variable
    updateReportTable(reportData, $reportSection);
  });
};

// Function to load default files
const loadDefaultFiles = async (filePaths) => {
  return Promise.all(filePaths.map((path) => {
    return fetch(path)
      .then(response => {
        if (!response.ok) throw new Error('Network response was not ok');
        return response.blob(); // Convert response to Blob
      })
      .then(blob => new File([blob], path.split('/').pop())); // Create a File object from the Blob
  }));
};

const initializeChat = () => {
  const chatButton = document.getElementById("openChat");
  const chatWindow = document.getElementById("chat-window");
  const closeChatButton = document.getElementById("closeChat");
  const sendMessageButton = document.getElementById("send-message");
  const userInput = document.getElementById("user-input");
  const chatMessages = document.getElementById("chat-messages");
  const expandChatButton = document.getElementById("expandChat");

  // Function to update chat window theme
  const updateChatTheme = () => {
    const isDarkTheme = document.body.classList.contains('bg-dark'); // Check if the body has dark theme class
    chatWindow.classList.toggle('dark', isDarkTheme);
    const chatHeader = chatWindow.querySelector('.chat-header');
    chatHeader.classList.toggle('dark', isDarkTheme);
    const messages = chatWindow.querySelector('.chat-messages');
    messages.classList.toggle('dark', isDarkTheme);
  };

  // Function to create chat bubbles
  const createChatBubbles = () => {
    const sampleQuestions = ["List all the isisn with domicile value as GB in internal value.", "Give me the list of ISIN's where status is Inactive for Domicile"];
    sampleQuestions.forEach(question => {
      const bubble = document.createElement("div");
      bubble.className = "chat-bubble"; // Ensure this class styles the bubble
      bubble.textContent = question;
      bubble.addEventListener("click", async () => {
        appendMessage("You", question, "user-message");
        userInput.value = ""; // Clear input field
        await sendMessage(question); // Send the selected question to the chatbot
      });
      chatMessages.appendChild(bubble);
    });
  };

  // Open chat window and minimize if already open
  chatButton.addEventListener("click", () => {
    if (chatWindow.style.display === "block") {
      chatWindow.style.display = "none"; // Minimize if already open
    } else {
      chatWindow.style.display = "block"; // Open chat window
      userInput.focus();
      updateChatTheme(); // Update theme when chat window opens
      createChatBubbles(); // Create chat bubbles on open
    }
  });

  // Close chat window
  closeChatButton.addEventListener("click", () => {
    chatWindow.style.display = "none";
  });

  // Expand chat window
  expandChatButton.addEventListener("click", () => {
    chatWindow.classList.toggle("expanded");
    if (chatWindow.classList.contains("expanded")) {
      expandChatButton.textContent = "Collapse"; // Change button text to Collapse
    } else {
      expandChatButton.textContent = "Expand"; // Change button text to Expand
    }
  });

  // Send message function
  const sendMessage = async (message) => {
    if (!message) {
      message = userInput.value.trim(); // Use user input if no message is provided
    }
    if (message) {
      appendMessage("You", message, "user-message"); // Append user message
      userInput.value = ""; // Clear input field
      const response = await getChatbotResponse(message); // Get chatbot response
      appendMessage("Bot", response, "bot-message"); // Append bot message
    }
  };

  sendMessageButton.addEventListener("click", () => sendMessage());

  // Send message on Enter key press
  userInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault(); // Prevent form submission
      sendMessage();
    }
  });

  // Append message to chat
  const appendMessage = (sender, message, messageType) => {
    const messageElement = document.createElement("div");
    messageElement.className = `message ${messageType}`; // Add message type class
    messageElement.textContent = message; // Only show the message text
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight; // Scroll to the bottom
  };

  // Mock function to simulate chatbot response
  const getChatbotResponse = async (message) => { // Removed reportData parameter
    try {
      const visibleRows = finalReportData.map(row => 
        [row.isin, row.fieldName, row.internalValue, row.externalValue, row.matched ? "Active" : "Inactive"] // Use finalReportData
      );
      console.log(visibleRows);
      const response = await dataChat(message, visibleRows);
      return response;
    } catch (error) {
      return `Error: ${error.message}`;
    }
  };
  async function dataChat(userMessage, visibleRows) {
    const context = visibleRows.map(row => 
      `ISIN: ${row[0]}, Field Name: ${row[1]}, Internal Value: ${row[2]}, External Value: ${row[3]}, Status: ${row[4]}`
    ).join('\n');
  
    const prompt = `Context:\n${context}\n\nUser message: ${userMessage}`;
    
    const proxyUrl = "https://llmfoundry.straive.com/anthropic/v1/messages";
    const jwtToken = llmFoundryToken;
    const model = "claude-3-5-sonnet-20240620";
  
    const payload = {
      model: model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }]
    };
  
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwtToken}`
      },
      body: JSON.stringify(payload)
    };
  
    try {
      const response = await fetch(proxyUrl, options);
      const jsonResponse = await response.json();
  
      if (jsonResponse.content && jsonResponse.content.length > 0) {
        return jsonResponse.content.map(item => item.text).join("\n");
      } else {
        return "Unexpected API response structure.";
      }
    } catch (error) {
      return `Error making API request: ${error.message}`;
    }
  };  
};

// Call the initializeChat function to set up the chat
initializeChat();

// Initialize the app
initializeApp();

$(document).ready(function () {
  // Make table headers resizable
  $('th').each(function () {
    const th = $(this);
    const resizer = $('<div class="resizer"></div>');
    th.append(resizer);

    resizer.on('mousedown', function (e) {
      e.preventDefault();
      const startX = e.pageX;
      const startWidth = th.width();

      $(document).on('mousemove', function (e) {
        const newWidth = startWidth + (e.pageX - startX);
        th.width(newWidth);
      });

      $(document).on('mouseup', function () {
        $(document).off('mousemove');
        $(document).off('mouseup');
      });
    });
  });
});

import pandas as pd
import os
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def convert_and_remove_excel_files(folder_path):
    # Loop through all files in the specified folder
    for file_name in os.listdir(folder_path):
        # Check if the file is an Excel file
        if file_name.lower().endswith(('.xlsx', '.xls')):
            excel_file_path = os.path.join(folder_path, file_name)

            # Load the Excel file
            try:
                df = pd.read_excel(excel_file_path)

                # Define the output CSV file path
                base_name, _ = os.path.splitext(excel_file_path)
                csv_file_path = base_name + '.csv'

                # Save the DataFrame to a CSV file
                df.to_csv(csv_file_path, index=False)

                # Remove the original Excel file
                os.remove(excel_file_path)

                logging.info(f"Converted and removed: {file_name} -> {os.path.basename(csv_file_path)}")

            except Exception as e:
                logging.error(f"Error processing file {file_name}: {e}")


# Example usage
convert_and_remove_excel_files('./external_files')

import pandas as pd
import os

def convert_and_remove_excel_files(folder_path):
    # Loop through all files in the specified folder
    for file_name in os.listdir(folder_path):
        # Check if the file is an Excel file
        if file_name.endswith('.xlsx') or file_name.endswith('.xls'):
            excel_file_path = os.path.join(folder_path, file_name)

            # Load the Excel file
            df = pd.read_excel(excel_file_path)

            # Define the output CSV file path
            csv_file_path = excel_file_path.replace('.xlsx', '.csv').replace('.xls', '.csv')

            # Save the DataFrame to a CSV file
            df.to_csv(csv_file_path, index=False)

            # Remove the original Excel file
            os.remove(excel_file_path)

            print(f"Converted and removed: {file_name} -> {os.path.basename(csv_file_path)}")

# Example usage
convert_and_remove_excel_files('./external_files')

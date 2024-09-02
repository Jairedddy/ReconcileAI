import os
import csv
import argparse


def preprocess_file(file_path):
    # Preprocess the file to remove null characters and replace them with empty strings
    temp_file_path = f"{file_path}.tmp"

    with open(file_path, 'rb') as infile, open(temp_file_path, 'wb') as outfile:
        for line in infile:
            # Replace null characters with nothing
            cleaned_line = line.replace(b'\x00', b'')
            outfile.write(cleaned_line)

    return temp_file_path


def convert_files(folder_path):
    for file_name in os.listdir(folder_path):
        file_path = os.path.join(folder_path, file_name)

        # Only process files that are CSV
        if os.path.isfile(file_path) and file_name.endswith(".csv"):
            # Preprocess the file to remove null characters
            preprocessed_file_path = preprocess_file(file_path)
            new_file_path = os.path.join(
                folder_path, f"{os.path.splitext(file_name)[0]}_fixed.csv"
            )

            try:
                with open(
                    preprocessed_file_path, 'r', encoding='utf-8', errors='replace'
                ) as infile, open(new_file_path, 'w', newline='', encoding='utf-8') as outfile:
                    reader = csv.reader(infile, delimiter='|')
                    csv_writer = csv.writer(outfile, delimiter=',', quoting=csv.QUOTE_MINIMAL)

                    for row in reader:
                        # Clean up fields: replace empty fields with "" and strip leading/trailing whitespace
                        cleaned_row = [field.strip() if field.strip() else '""' for field in row]

                        # Write the row
                        csv_writer.writerow(cleaned_row)

                # Remove the original file and the temporary preprocessed file after conversion
                os.remove(file_path)
                os.remove(preprocessed_file_path)
                print(f"Converted and removed: {file_name}")

            except Exception as e:
                print(f"Failed to process {file_name}: {e}")

    print("Conversion complete.")


def main():
    parser = argparse.ArgumentParser(
        description="Convert CSV files with '|' delimiter to proper CSV format with ',' delimiter."
    )
    parser.add_argument(
        'folder_path', type=str, help='Path to the folder containing the files to convert'
    )

    args = parser.parse_args()

    folder_path = args.folder_path

    if not os.path.isdir(folder_path):
        print(f"The folder path '{folder_path}' does not exist.")
        return

    convert_files(folder_path)


if __name__ == "__main__":
    main()

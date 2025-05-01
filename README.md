# Facebook Marketplace PC Scraper

A tool to scrape product listings from Facebook Marketplace using LLM-based extraction.

## Prerequisites

- Node.js
- TypeScript
- OpenAI API key

## Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Set up your OpenAI API key in a `.env` file:
   ```
   OPENAI_API_KEY=your-api-key-here
   ```

## Usage

Run the script with:

```bash
npm start -- [options]
```

### Options

- `--input`, `-i` : Path to a file containing URLs to scrape (text or JSON format)
- `--output`, `-o` : Base name for output files (default: pc_listings)
- `--help`, `-h` : Display help message

### Input File Formats

The input file can be either:

1. A plain text file with one URL per line:
   ```
   https://www.facebook.com/marketplace/item/123456789/
   https://www.facebook.com/marketplace/item/987654321/
   ```

2. A JSON file with an array of URLs:
   ```json
   [
     "https://www.facebook.com/marketplace/item/123456789/",
     "https://www.facebook.com/marketplace/item/987654321/"
   ]
   ```

3. A JSON file with a "urls" property:
   ```json
   {
     "urls": [
       "https://www.facebook.com/marketplace/item/123456789/",
       "https://www.facebook.com/marketplace/item/987654321/"
     ]
   }
   ```

### Output

The script generates two files in the `output` directory:

1. A JSON file with the full structured data
2. A CSV file with the same data for easy import into spreadsheets

Filenames include timestamps to prevent overwriting previous runs.

## Examples

```bash
# Scrape links from a text file
npm start -- -i example-urls.txt

# Scrape links and customize output filename
npm start -- -i example-urls.json -o gaming_pcs
```

## Data Extracted

For each PC listing, the following data is extracted:
- Title
- Price
- Brand
- Model
- CPU
- RAM
- Storage
- Availability
- Quantity
- Location
- Description
- Image URL
- Original URL
import { chromium, Page } from "playwright";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import LLMScraper from "llm-scraper";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load environment variables
dotenv.config();

// Define the PC listing schema for Facebook Marketplace
const ProductSchema = z.object({
  product: z.object({
    // PC specific fields
    title: z.string().describe("The title of the Facebook Marketplace listing"),
    price: z
      .string()
      .describe("The current price of the PC, including currency symbol"),
    brand: z
      .string()
      .describe("The brand of the PC (e.g., Dell, HP, Lenovo, Custom)"),
    model: z.string().describe("The model of the PC if available"),
    cpu: z
      .string()
      .describe(
        "The CPU/processor in the PC (e.g., Intel i7-12700K, AMD Ryzen 5 5600X)"
      ),
    ram: z.string().describe("The RAM specification (e.g., 16GB DDR4)"),
    storage: z
      .string()
      .describe(
        "The storage specification (e.g., 1TB SSD, 512GB NVMe + 2TB HDD)"
      ),

    // FB Marketplace specific fields
    availability: z.string().describe("Whether the item is available or sold"),
    quantity: z.string().describe("The quantity available if specified"),
    location: z.string().describe("The location of the seller"),
    description: z
      .string()
      .describe(
        "Important notes from the description (specs, condition, etc.)"
      ),
    imageUrl: z.string().url().describe("URL of the main listing image"),
    originalUrl: z
      .string()
      .url()
      .describe("The original URL of the Facebook Marketplace listing"),
  }),
});

type Product = z.infer<typeof ProductSchema>["product"];

/**
 * Ensures the output directory exists with a timestamp subfolder
 */
function ensureOutputDirectoryExists(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const baseOutputDir = path.join(process.cwd(), "output");
  const outputDir = path.join(baseOutputDir, timestamp);
  
  if (!fs.existsSync(baseOutputDir)) {
    fs.mkdirSync(baseOutputDir, { recursive: true });
    console.log("📁 Created base output directory");
  }
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`📁 Created output directory for timestamp: ${timestamp}`);
  }
  
  return outputDir;
}

/**
 * Read URLs from a file
 * @param filePath Path to the file containing URLs
 * @returns Array of URLs
 */
function readUrlsFromFile(filePath: string): string[] {
  try {
    const fileContent = fs.readFileSync(filePath, "utf-8");
    
    // Try to parse as JSON first
    try {
      const jsonData = JSON.parse(fileContent);
      if (Array.isArray(jsonData)) {
        return jsonData;
      } else if (jsonData.urls && Array.isArray(jsonData.urls)) {
        return jsonData.urls;
      }
    } catch {
      // Not valid JSON, treat as text file with one URL per line
      return fileContent
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0 && line.startsWith("http"));
    }
    
    throw new Error("Could not parse input file format");
  } catch (error) {
    console.error(`❌ Error reading URLs file: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Main function to process a list of product URLs
 * @param urls List of product URLs to process
 */
async function scrapeProducts(urls: string[]): Promise<Product[]> {
  console.log(`🔍 Starting to scrape ${urls.length} products...`);

  // Initialize LLM
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  const llm = openai.chat("gpt-4.1-mini");
  const scraper = new LLMScraper(llm);

  // Launch browser
  const browser = await chromium.launch({
    headless: true,
  });

  const products: Product[] = [];

  try {
    // Process URLs one by one with rate limiting
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      process.stdout.write(`⏳ Processing URL ${i + 1}/${urls.length}... `);

      try {
        // Create a new context for each URL to avoid cookie/cache issues
        const context = await browser.newContext({
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
          bypassCSP: true,
        });

        const page = await context.newPage();

        // Set a reasonable timeout
        await page.goto(url, { timeout: 30000 });

        // Extract product information
        const product = await extractProductInfo(page, scraper, url);
        products.push(product);
        console.log("✅ Done");

        // Close the context to clean up
        await context.close();

        // Add delay between requests to avoid rate limiting
        if (i < urls.length - 1) {
          const delay = Math.floor(Math.random() * 2000) + 1000; // 1-3 seconds
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } catch (error) {
        console.error(`❌ Failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    await browser.close();
  }

  return products;
}

/**
 * Extract product information from a page
 * @param page Playwright Page object
 * @param scraper LLM Scraper instance
 * @param originalUrl Original URL of the product
 */
async function extractProductInfo(
  page: Page,
  scraper: LLMScraper,
  originalUrl: string
): Promise<Product> {
  try {
    // Use LLM scraper to extract product details
    const { data } = await scraper.run(page, ProductSchema, {
      format: "markdown",
    });

    // Add the original URL to the product data
    const product = {
      ...data.product,
      originalUrl,
    };

    return product;
  } catch (error) {
    console.error("Error extracting product information:", error);

    // Safely extract error message
    let errorMessage = "Unknown error";
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === "string") {
      errorMessage = error;
    } else if (error && typeof error === "object" && "message" in error) {
      errorMessage = String((error as Record<string, unknown>).message);
    }

    // Return a placeholder with error information
    return {
      title: "Extraction Failed",
      price: "Unknown",
      brand: "Unknown",
      model: "Unknown",
      cpu: "Unknown",
      ram: "Unknown",
      storage: "Unknown",
      availability: "Unknown",
      quantity: "Unknown",
      location: "Unknown",
      description: `Failed to extract information: ${errorMessage}`,
      imageUrl: "",
      originalUrl,
    };
  }
}

/**
 * Display formatted product information in the console
 * @param products List of products to display
 */
function displayProducts(products: Product[]): void {
  console.log("\n📊 SCRAPING SUMMARY");
  console.log(`Total listings processed: ${products.length}`);
  
  // Count successful extractions
  const successful = products.filter(p => p.title !== "Extraction Failed").length;
  console.log(`Successful extractions: ${successful}/${products.length}`);
  
  // Calculate price statistics if we have successful extractions
  if (successful > 0) {
    const prices = products
      .map(p => p.price !== "Unknown" ? parseFloat(p.price.replace(/[^0-9.]/g, '')) : NaN)
      .filter(price => !isNaN(price));
      
    if (prices.length > 0) {
      const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      
      console.log(`Price range: $${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}`);
      console.log(`Average price: $${avgPrice.toFixed(2)}`);
    }
  }
  
  // Display the first few items
  const displayCount = Math.min(3, products.length);
  if (displayCount > 0) {
    console.log("\n📝 SAMPLE LISTINGS");
    for (let i = 0; i < displayCount; i++) {
      const p = products[i];
      console.log(`\n#${i + 1}: ${p.title}`);
      console.log(`💰 ${p.price} | 🖥️ ${p.brand} ${p.model}`);
      console.log(`⚙️ CPU: ${p.cpu} | 🧠 RAM: ${p.ram} | 💾 Storage: ${p.storage}`);
      console.log(`📍 ${p.location} | 🛒 ${p.availability}`);
    }
  }
  
  console.log("\n💾 Full details saved to output files");
}

/**
 * Save product information to a JSON file
 * @param products List of products to save
 * @param outputDir Output directory
 * @param filename Output filename
 */
function saveProductsToFile(
  products: Product[],
  outputDir: string,
  filename: string = "pc_listings.json"
): string {
  const fullPath = path.join(outputDir, filename);
  fs.writeFileSync(fullPath, JSON.stringify(products, null, 2));
  return fullPath;
}

/**
 * Save product information to a CSV file
 * @param products List of products to save
 * @param outputDir Output directory
 * @param filename Output filename
 */
function saveProductsToCSV(
  products: Product[],
  outputDir: string,
  filename: string = "pc_listings.csv"
): string {
  // Define headers for CSV
  const headers = [
    "Title",
    "Price",
    "Brand",
    "Model",
    "CPU",
    "RAM",
    "Storage",
    "Availability",
    "Quantity",
    "Location",
    "Description",
    "Image URL",
    "Original URL",
  ];

  // Create rows for each product
  const rows = products.map((product) => [
    product.title,
    product.price,
    product.brand,
    product.model,
    product.cpu,
    product.ram,
    product.storage,
    product.availability,
    product.quantity,
    product.location,
    product.description,
    product.imageUrl,
    product.originalUrl,
  ]);

  // Prepare CSV content
  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row
        .map((cell) =>
          // Escape cell content if it contains commas, quotes, or newlines
          cell ? `"${cell.replace(/"/g, '""')}"` : ""
        )
        .join(",")
    ),
  ].join("\n");

  // Write to file
  const fullPath = path.join(outputDir, filename);
  fs.writeFileSync(fullPath, csvContent);
  return fullPath;
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options: {
    inputFile?: string;
    outputPrefix?: string;
    showHelp: boolean;
  } = {
    showHelp: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--input" || arg === "-i") {
      options.inputFile = args[++i];
    } else if (arg === "--output" || arg === "-o") {
      options.outputPrefix = args[++i];
    } else if (arg === "--help" || arg === "-h") {
      options.showHelp = true;
    }
  }

  return options;
}

/**
 * Print usage instructions
 */
function printUsage(): void {
  console.log("📋 FB Marketplace PC Scraper");
  console.log("\nUsage: npm start -- [options]");
  console.log("\nOptions:");
  console.log("  --input, -i <file>   Path to file containing URLs to scrape");
  console.log("  --output, -o <name>  Base name for output files (default: pc_listings)");
  console.log("  --help, -h           Display this help message");
  console.log("\nExamples:");
  console.log("  npm start -- -i urls.txt");
  console.log("  npm start -- -i urls.json -o gaming_pcs");
}

/**
 * Main execution function
 */
async function main() {
  // Parse command line arguments
  const options = parseArgs();
  
  if (options.showHelp) {
    printUsage();
    return;
  }
  
  console.log("🚀 FB Marketplace PC Scraper");
  
  // Ensure output directory exists
  const outputDir = ensureOutputDirectoryExists();
  
  // Example Facebook Marketplace URLs for PCs
  const exampleUrls = [
    "https://www.facebook.com/marketplace/item/3205154652960339/",
    "https://www.facebook.com/marketplace/item/664792412773207/",
    "https://www.facebook.com/marketplace/item/3856292544625767/",
  ];

  // Determine which URLs to scrape
  let urlsToScrape: string[] = exampleUrls;
  
  if (options.inputFile) {
    console.log(`📄 Reading URLs from ${options.inputFile}...`);
    const urls = readUrlsFromFile(options.inputFile);
    
    if (urls.length > 0) {
      urlsToScrape = urls;
      console.log(`📋 Found ${urls.length} URLs to process`);
    } else {
      console.log("⚠️ No valid URLs found in input file. Using example URLs.");
    }
  } else {
    console.log("ℹ️ No input file provided. Using example URLs.");
  }

  // Prepare output filenames
  const outputPrefix = options.outputPrefix || "pc_listings";
  const jsonFilename = `${outputPrefix}.json`;
  const csvFilename = `${outputPrefix}.csv`;

  try {
    const products = await scrapeProducts(urlsToScrape);
    displayProducts(products);
    
    // Save results to files
    const jsonPath = saveProductsToFile(products, outputDir, jsonFilename);
    const csvPath = saveProductsToCSV(products, outputDir, csvFilename);
    
    console.log(`\n💾 Results saved to:\n  - ${jsonPath}\n  - ${csvPath}`);
    console.log("\n✨ Scraping complete!");
  } catch (error) {
    console.error("❌ Error in main execution:", error);
  }
}

// Run the main function
main().catch(console.error);
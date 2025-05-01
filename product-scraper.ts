import { chromium, Page } from "playwright";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import LLMScraper from "llm-scraper";
import dotenv from "dotenv";
import fs from "fs";

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
 * Main function to process a list of product URLs
 * @param urls List of product URLs to process
 */
async function scrapeProducts(urls: string[]): Promise<Product[]> {
  console.log(`Starting to scrape ${urls.length} products...`);

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
      console.log(`Processing URL ${i + 1}/${urls.length}: ${url}`);

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

        // Close the context to clean up
        await context.close();

        // Add delay between requests to avoid rate limiting
        if (i < urls.length - 1) {
          const delay = Math.floor(Math.random() * 2000) + 1000; // 1-3 seconds
          console.log(`Waiting ${delay}ms before next request...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } catch (error) {
        console.error(`Error processing ${url}:`, error);
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
    console.log("Extracting product information...");

    // Use LLM scraper to extract product details
    const { data } = await scraper.run(page, ProductSchema, {
      format: "markdown",
    });

    // Add the original URL to the product data
    const product = {
      ...data.product,
      originalUrl,
    };

    console.log("Product information extracted successfully");
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
  console.log("\n=== PC LISTINGS COMPARISON ===\n");

  products.forEach((product, index) => {
    console.log(`Listing ${index + 1}: ${product.title}`);
    console.log(`Price: ${product.price}`);
    console.log(`Brand: ${product.brand}`);
    console.log(`Model: ${product.model}`);
    console.log(`CPU: ${product.cpu}`);
    console.log(`RAM: ${product.ram}`);
    console.log(`Storage: ${product.storage}`);
    console.log(`Availability: ${product.availability}`);
    console.log(`Quantity: ${product.quantity}`);
    console.log(`Location: ${product.location}`);
    console.log(`Description: ${product.description}`);
    console.log(`Image URL: ${product.imageUrl}`);
    console.log(`Original URL: ${product.originalUrl}`);
    console.log("-----------------------------------");
  });
}

/**
 * Save product information to a JSON file
 * @param products List of products to save
 * @param filename Output filename
 */
function saveProductsToFile(
  products: Product[],
  filename: string = "pc_listings.json"
): void {
  fs.writeFileSync(filename, JSON.stringify(products, null, 2));
  console.log(`Product information saved to ${filename}`);
}

/**
 * Save product information to a CSV file
 * @param products List of products to save
 * @param filename Output filename
 */
function saveProductsToCSV(
  products: Product[],
  filename: string = "pc_listings.csv"
): void {
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
  fs.writeFileSync(filename, csvContent);
  console.log(`Product information saved to ${filename}`);
}

/**
 * Main execution function
 */
async function main() {
  // Example Facebook Marketplace URLs for PCs
  // Note: These should be replaced with actual FB Marketplace URLs for PCs
  const exampleUrls = [
    "https://www.facebook.com/marketplace/item/3205154652960339/",
    "https://www.facebook.com/marketplace/item/664792412773207/",
    "https://www.facebook.com/marketplace/item/3856292544625767/",
  ];

  // Check for command line arguments (URLs could be passed as arguments)
  const args = process.argv.slice(2);
  const urlsToScrape = args.length > 0 ? args : exampleUrls;

  try {
    const products = await scrapeProducts(urlsToScrape);
    displayProducts(products);
    saveProductsToFile(products); // Save to JSON
    saveProductsToCSV(products); // Save to CSV
    console.log(
      "\nScraping complete. Results saved to pc_listings.json and pc_listings.csv"
    );
  } catch (error) {
    console.error("Error in main execution:", error);
  }
}

// Run the main function
main().catch(console.error);

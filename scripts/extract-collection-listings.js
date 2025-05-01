// This script extracts Facebook Marketplace listing links from the current page.
// Intended for use in the browser console.
// You can paste the output into a text file for processing.

// Function to extract Facebook Marketplace listing links
function extractMarketplaceListings() {
  // Get all anchor elements on the page
  const allLinks = document.querySelectorAll('a');
  
  // Convert to array for filtering
  const linkArray = Array.from(allLinks);
  
  // Filter for marketplace item links matching the pattern
  const marketplaceLinks = linkArray
    .map(link => link.href)
    .filter(href => href.includes('facebook.com/marketplace/item/'))
    // Remove duplicates
    .filter((link, index, self) => self.indexOf(link) === index);
  
  // Join all links with newlines for easy copying
  const linkText = marketplaceLinks.join('\n');
  
  // Print all links in a single console output for easy copying
  console.log(linkText);
  
  // Return the count for confirmation
  console.log(`\nFound ${marketplaceLinks.length} unique marketplace listings.`);
  
  return marketplaceLinks;
}

// Execute the function
extractMarketplaceListings();
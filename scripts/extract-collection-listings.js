// This script extracts Facebook Marketplace listing links from the current page.
// Intended for use in the browser console.

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
    
    // Format links as comma-separated with quotes
    const formattedLinks = marketplaceLinks
      .map(link => `"${link}"`)
      .join(',\n');
    
    // Log the result to console
    console.log('Marketplace Listing Links:');
    console.log(formattedLinks);
    
    // Return the count for confirmation
    console.log(`\nFound ${marketplaceLinks.length} unique marketplace listings.`);
    
    return formattedLinks;
  }
  
  // Execute the function
  extractMarketplaceListings();
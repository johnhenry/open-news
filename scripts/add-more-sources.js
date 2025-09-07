import db from '../src/db/database.js';

const additionalSources = [
  // LEFT-LEANING SOURCES
  {
    name: 'Vox',
    url: 'https://www.vox.com',
    rss_url: 'https://www.vox.com/rss/index.xml',
    bias: 'left',
    bias_score: -0.7,
    notes: 'Explanatory journalism with progressive perspective'
  },
  {
    name: 'Mother Jones',
    url: 'https://www.motherjones.com',
    rss_url: 'https://www.motherjones.com/feed/',
    bias: 'left',
    bias_score: -0.8,
    notes: 'Investigative journalism with liberal viewpoint'
  },
  {
    name: 'The Nation',
    url: 'https://www.thenation.com',
    rss_url: 'https://www.thenation.com/feed/',
    bias: 'left',
    bias_score: -0.8,
    notes: 'Progressive political and cultural news'
  },
  {
    name: 'Daily Kos',
    url: 'https://www.dailykos.com',
    rss_url: 'https://www.dailykos.com/rss',
    bias: 'left',
    bias_score: -0.9,
    notes: 'Progressive political blog and news'
  },
  {
    name: 'Salon',
    url: 'https://www.salon.com',
    rss_url: 'https://www.salon.com/feed/',
    bias: 'left',
    bias_score: -0.7,
    notes: 'Progressive news and commentary'
  },
  {
    name: 'The Intercept',
    url: 'https://theintercept.com',
    rss_url: 'https://theintercept.com/feed/',
    bias: 'left',
    bias_score: -0.6,
    notes: 'Investigative journalism'
  },
  {
    name: 'Common Dreams',
    url: 'https://www.commondreams.org',
    rss_url: 'https://www.commondreams.org/rss.xml',
    bias: 'left',
    bias_score: -0.8,
    notes: 'Progressive news and views'
  },

  // CENTER-LEFT SOURCES
  {
    name: 'The New York Times',
    url: 'https://www.nytimes.com',
    rss_url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
    bias: 'center-left',
    bias_score: -0.3,
    notes: 'Leading national newspaper'
  },
  {
    name: 'The Washington Post',
    url: 'https://www.washingtonpost.com',
    rss_url: 'https://feeds.washingtonpost.com/rss/national',
    bias: 'center-left',
    bias_score: -0.3,
    notes: 'Major national newspaper'
  },
  {
    name: 'CBS News',
    url: 'https://www.cbsnews.com',
    rss_url: 'https://www.cbsnews.com/latest/rss/main',
    bias: 'center-left',
    bias_score: -0.2,
    notes: 'Television news network'
  },
  {
    name: 'ABC News',
    url: 'https://abcnews.go.com',
    rss_url: 'https://feeds.abcnews.com/abcnews/topstories',
    bias: 'center-left',
    bias_score: -0.2,
    notes: 'Television news network'
  },
  {
    name: 'NBC News',
    url: 'https://www.nbcnews.com',
    rss_url: 'https://feeds.nbcnews.com/nbcnews/public/news',
    bias: 'center-left',
    bias_score: -0.2,
    notes: 'Television news network'
  },
  {
    name: 'Politico',
    url: 'https://www.politico.com',
    rss_url: 'https://www.politico.com/rss/politicopicks.xml',
    bias: 'center-left',
    bias_score: -0.2,
    notes: 'Political journalism'
  },
  {
    name: 'The Atlantic',
    url: 'https://www.theatlantic.com',
    rss_url: 'https://feeds.feedburner.com/TheAtlantic',
    bias: 'center-left',
    bias_score: -0.3,
    notes: 'Magazine covering politics and culture'
  },
  {
    name: 'Slate',
    url: 'https://slate.com',
    rss_url: 'https://slate.com/feeds/all.rss',
    bias: 'center-left',
    bias_score: -0.4,
    notes: 'Online magazine'
  },

  // CENTER SOURCES
  {
    name: 'Associated Press',
    url: 'https://apnews.com',
    rss_url: 'https://rsshub.app/apnews/topics/apf-topnews',
    bias: 'center',
    bias_score: 0,
    notes: 'Wire service - using alternative RSS feed'
  },
  {
    name: 'Reuters',
    url: 'https://www.reuters.com',
    rss_url: 'https://rsshub.app/reuters/channel/top-news',
    bias: 'center',
    bias_score: 0,
    notes: 'International news agency - using alternative RSS feed'
  },
  {
    name: 'Bloomberg',
    url: 'https://www.bloomberg.com',
    rss_url: 'https://feeds.bloomberg.com/markets/news.rss',
    bias: 'center',
    bias_score: 0.1,
    notes: 'Business and financial news'
  },
  {
    name: 'Financial Times',
    url: 'https://www.ft.com',
    rss_url: 'https://www.ft.com/?format=rss',
    bias: 'center',
    bias_score: 0.1,
    notes: 'International business news'
  },
  {
    name: 'Christian Science Monitor',
    url: 'https://www.csmonitor.com',
    rss_url: 'https://rss.csmonitor.com/feeds/csm',
    bias: 'center',
    bias_score: 0,
    notes: 'International news'
  },
  {
    name: 'Axios',
    url: 'https://www.axios.com',
    rss_url: 'https://api.axios.com/feed/',
    bias: 'center',
    bias_score: 0,
    notes: 'Smart brevity news'
  },
  {
    name: 'The Economist',
    url: 'https://www.economist.com',
    rss_url: 'https://www.economist.com/feeds/print-sections/77/united-states.xml',
    bias: 'center',
    bias_score: 0.1,
    notes: 'International weekly newspaper'
  },
  {
    name: 'MarketWatch',
    url: 'https://www.marketwatch.com',
    rss_url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories',
    bias: 'center',
    bias_score: 0,
    notes: 'Financial news'
  },

  // CENTER-RIGHT SOURCES
  {
    name: 'The Telegraph',
    url: 'https://www.telegraph.co.uk',
    rss_url: 'https://www.telegraph.co.uk/rss.xml',
    bias: 'center-right',
    bias_score: 0.3,
    notes: 'British broadsheet newspaper'
  },
  {
    name: 'Forbes',
    url: 'https://www.forbes.com',
    rss_url: 'https://www.forbes.com/feeds/rss/headlines',
    bias: 'center-right',
    bias_score: 0.2,
    notes: 'Business magazine'
  },
  {
    name: 'Fortune',
    url: 'https://fortune.com',
    rss_url: 'https://fortune.com/feed/',
    bias: 'center-right',
    bias_score: 0.2,
    notes: 'Business magazine'
  },
  {
    name: 'The Dispatch',
    url: 'https://thedispatch.com',
    rss_url: 'https://thedispatch.com/feed',
    bias: 'center-right',
    bias_score: 0.4,
    notes: 'Conservative news and commentary'
  },
  {
    name: 'RealClearPolitics',
    url: 'https://www.realclearpolitics.com',
    rss_url: 'https://www.realclearpolitics.com/index.xml',
    bias: 'center-right',
    bias_score: 0.3,
    notes: 'Political news aggregator'
  },
  {
    name: 'Reason',
    url: 'https://reason.com',
    rss_url: 'https://reason.com/feed/',
    bias: 'center-right',
    bias_score: 0.3,
    notes: 'Libertarian magazine'
  },

  // RIGHT-LEANING SOURCES
  {
    name: 'National Review',
    url: 'https://www.nationalreview.com',
    rss_url: 'https://www.nationalreview.com/feed/',
    bias: 'right',
    bias_score: 0.6,
    notes: 'Conservative magazine'
  },
  {
    name: 'The Daily Wire',
    url: 'https://www.dailywire.com',
    rss_url: 'https://www.dailywire.com/feeds/rss.xml',
    bias: 'right',
    bias_score: 0.7,
    notes: 'Conservative news and opinion'
  },
  {
    name: 'The Federalist',
    url: 'https://thefederalist.com',
    rss_url: 'https://thefederalist.com/feed/',
    bias: 'right',
    bias_score: 0.7,
    notes: 'Conservative online magazine'
  },
  {
    name: 'Daily Caller',
    url: 'https://dailycaller.com',
    rss_url: 'https://dailycaller.com/feed/',
    bias: 'right',
    bias_score: 0.7,
    notes: 'Conservative news website'
  },
  {
    name: 'Newsmax',
    url: 'https://www.newsmax.com',
    rss_url: 'https://www.newsmax.com/rss/Newsfront/1/',
    bias: 'right',
    bias_score: 0.8,
    notes: 'Conservative news'
  },
  {
    name: 'The Blaze',
    url: 'https://www.theblaze.com',
    rss_url: 'https://www.theblaze.com/rss',
    bias: 'right',
    bias_score: 0.7,
    notes: 'Conservative news and opinion'
  },
  {
    name: 'One America News',
    url: 'https://www.oann.com',
    rss_url: 'https://www.oann.com/feed/',
    bias: 'right',
    bias_score: 0.9,
    notes: 'Conservative news network'
  },
  {
    name: 'The American Conservative',
    url: 'https://www.theamericanconservative.com',
    rss_url: 'https://www.theamericanconservative.com/feed/',
    bias: 'right',
    bias_score: 0.6,
    notes: 'Conservative magazine'
  },
  {
    name: 'RedState',
    url: 'https://redstate.com',
    rss_url: 'https://redstate.com/feed/',
    bias: 'right',
    bias_score: 0.7,
    notes: 'Conservative blog'
  },

  // INTERNATIONAL SOURCES
  {
    name: 'Al Jazeera',
    url: 'https://www.aljazeera.com',
    rss_url: 'https://www.aljazeera.com/xml/rss/all.xml',
    bias: 'center-left',
    bias_score: -0.2,
    notes: 'Qatar-based international news'
  },
  {
    name: 'Deutsche Welle',
    url: 'https://www.dw.com',
    rss_url: 'https://rss.dw.com/rdf/rss-en-all',
    bias: 'center',
    bias_score: 0,
    notes: 'German international broadcaster'
  },
  {
    name: 'France 24',
    url: 'https://www.france24.com',
    rss_url: 'https://www.france24.com/en/rss',
    bias: 'center',
    bias_score: 0,
    notes: 'French international news'
  },
  {
    name: 'RT News',
    url: 'https://www.rt.com',
    rss_url: 'https://www.rt.com/rss/',
    bias: 'right',
    bias_score: 0.5,
    notes: 'Russian state-funded news'
  },
  {
    name: 'The Times of India',
    url: 'https://timesofindia.indiatimes.com',
    rss_url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',
    bias: 'center',
    bias_score: 0,
    notes: 'Indian newspaper'
  },
  {
    name: 'South China Morning Post',
    url: 'https://www.scmp.com',
    rss_url: 'https://www.scmp.com/rss/91/feed',
    bias: 'center',
    bias_score: 0,
    notes: 'Hong Kong newspaper'
  },
  {
    name: 'The Globe and Mail',
    url: 'https://www.theglobeandmail.com',
    rss_url: 'https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/canada/',
    bias: 'center',
    bias_score: 0,
    notes: 'Canadian newspaper'
  },
  {
    name: 'The Sydney Morning Herald',
    url: 'https://www.smh.com.au',
    rss_url: 'https://www.smh.com.au/rss/feed.xml',
    bias: 'center-left',
    bias_score: -0.2,
    notes: 'Australian newspaper'
  }
];

// Function to add sources to the database
function addSources() {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO sources (
      name, url, rss_url, bias, bias_score, scraping_enabled, active, notes
    ) VALUES (
      @name, @url, @rss_url, @bias, @bias_score, @scraping_enabled, @active, @notes
    )
  `);

  let addedCount = 0;
  let skippedCount = 0;

  for (const source of additionalSources) {
    try {
      const result = stmt.run({
        ...source,
        scraping_enabled: 0,
        active: 1
      });
      
      if (result.changes > 0) {
        addedCount++;
        console.log(`✅ Added: ${source.name} (${source.bias})`);
      } else {
        skippedCount++;
        console.log(`⏭️  Skipped (already exists): ${source.name}`);
      }
    } catch (error) {
      console.error(`❌ Error adding ${source.name}:`, error.message);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Added: ${addedCount} new sources`);
  console.log(`   Skipped: ${skippedCount} existing sources`);
  console.log(`   Total sources to add: ${additionalSources.length}`);
  
  // Show current totals
  const totalCount = db.prepare('SELECT COUNT(*) as count FROM sources').get();
  const activeCount = db.prepare('SELECT COUNT(*) as count FROM sources WHERE active = 1').get();
  const biasCounts = db.prepare(`
    SELECT bias, COUNT(*) as count 
    FROM sources 
    WHERE active = 1 
    GROUP BY bias 
    ORDER BY 
      CASE bias 
        WHEN 'left' THEN 1 
        WHEN 'center-left' THEN 2 
        WHEN 'center' THEN 3 
        WHEN 'center-right' THEN 4 
        WHEN 'right' THEN 5 
      END
  `).all();

  console.log(`\n📈 Database Status:`);
  console.log(`   Total sources: ${totalCount.count}`);
  console.log(`   Active sources: ${activeCount.count}`);
  console.log(`\n   Distribution by bias:`);
  for (const row of biasCounts) {
    console.log(`   - ${row.bias}: ${row.count} sources`);
  }
}

// Run the script
console.log('🚀 Adding additional news sources...\n');
addSources();
console.log('\n✨ Done!');
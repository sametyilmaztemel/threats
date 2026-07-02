-- =====================================================
-- THREATS.0RCE.COM — Seed Data
-- Initial source list (70 public sources)
-- =====================================================

-- TIER 1: Official / High Quality
INSERT INTO sources (name, type, url, category, tier, fetch_interval_min, requires_key) VALUES
('NVD', 'api', 'https://services.nvd.nist.gov/rest/json/cves/2.0', 'official', 1, 60, FALSE),
('MITRE ATT&CK', 'stix', 'https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json', 'official', 1, 360, FALSE),
('CISA KEV', 'json', 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', 'official', 1, 30, FALSE),
('CISA Alerts', 'rss', 'https://www.cisa.gov/news/cybersecurity-advisories.xml', 'official', 1, 60, FALSE),
('US-CERT', 'rss', 'https://www.cisa.gov/news.xml', 'official', 1, 60, FALSE),
('OSV.dev', 'api', 'https://api.osv.dev/v1/query', 'official', 1, 60, FALSE),
('GHSA', 'api', 'https://api.github.com/advisories', 'official', 1, 60, FALSE),
('FIRST EPSS', 'csv', 'https://epss.cyentia.com/epss_scores-current.csv.gz', 'official', 1, 360, FALSE),
('Exploit-DB', 'rss', 'https://www.exploit-db.com/rss.xml', 'official', 1, 120, FALSE),
('MITRE ATLAS', 'json', 'https://raw.githubusercontent.com/mitre-atlas/atlas-navigator-data/main/dist/atlas-data.json', 'ai', 1, 360, FALSE);

-- TIER 2: News (RSS)
INSERT INTO sources (name, type, url, category, tier, fetch_interval_min) VALUES
('BleepingComputer', 'rss', 'https://www.bleepingcomputer.com/feed/', 'news', 2, 15),
('The Hacker News', 'rss', 'https://feeds.feedburner.com/TheHackersNews', 'news', 2, 15),
('Krebs on Security', 'rss', 'https://krebsonsecurity.com/feed/', 'news', 2, 30),
('The Record', 'rss', 'https://therecord.media/feed/', 'news', 2, 15),
('Dark Reading', 'rss', 'https://www.darkreading.com/rss.xml', 'news', 2, 30),
('SecurityWeek', 'rss', 'https://www.securityweek.com/feed/', 'news', 2, 30),
('Threatpost', 'rss', 'https://threatpost.com/feed/', 'news', 2, 30),
('Help Net Security', 'rss', 'https://www.helpnetsecurity.com/feed/', 'news', 2, 30),
('CSO Online', 'rss', 'https://www.csoonline.com/feed/', 'news', 2, 60),
('InfoSecurity Magazine', 'rss', 'https://www.infosecurity-magazine.com/rss/', 'news', 2, 60),
('CyberScoop', 'rss', 'https://www.cyberscoop.com/feed/', 'news', 2, 30),
('SC Magazine', 'rss', 'https://www.scmagazine.com/feed/', 'news', 2, 60),
('GBHackers', 'rss', 'https://www.gbhackers.com/feed/', 'news', 2, 60),
('SiliconAngle Security', 'rss', 'https://siliconangle.com/category/security/feed/', 'news', 2, 60),
('Hacker News Frontpage', 'rss', 'https://hnrss.org/frontpage?points=100', 'news', 2, 60);

-- TIER 3: Vendor Blogs (RSS)
INSERT INTO sources (name, type, url, category, tier, fetch_interval_min) VALUES
('Talos (Cisco)', 'rss', 'https://blog.talosintelligence.com/feeds/posts/default', 'vendor', 2, 60),
('Microsoft Security', 'rss', 'https://www.microsoft.com/security/blog/feed/', 'vendor', 2, 60),
('Google TAG', 'rss', 'https://blog.google/threat-analysis-group/rss/', 'vendor', 2, 60),
('Mandiant', 'rss', 'https://www.mandiant.com/resources/blog/rss.xml', 'vendor', 2, 60),
('CrowdStrike', 'rss', 'https://www.crowdstrike.com/blog/feed/', 'vendor', 2, 60),
('Palo Alto Unit 42', 'rss', 'https://unit42.paloaltonetworks.com/feed/', 'vendor', 2, 60),
('Trend Micro', 'rss', 'https://www.trendmicro.com/en_us/research.rss', 'vendor', 2, 60),
('Sophos News', 'rss', 'https://news.sophos.com/feed/', 'vendor', 2, 60),
('Rapid7', 'rss', 'https://blog.rapid7.com/rss/', 'vendor', 2, 60),
('Proofpoint', 'rss', 'https://www.proofpoint.com/us/rss.xml', 'vendor', 2, 60),
('ESET', 'rss', 'https://www.welivesecurity.com/feed/', 'vendor', 2, 60),
('Kaspersky', 'rss', 'https://securelist.com/feed/', 'vendor', 2, 60),
('F-Secure', 'rss', 'https://blog.f-secure.com/feed/', 'vendor', 2, 60),
('SANS ISC', 'rss', 'https://isc.sans.edu/rssfeed_full.xml', 'vendor', 2, 30),
('Check Point Research', 'rss', 'https://research.checkpoint.com/feed/', 'vendor', 2, 60),
('Fortinet', 'rss', 'https://www.fortinet.com/blog/threat-research.rss', 'vendor', 2, 60),
('Tenable', 'rss', 'https://www.tenable.com/blog/feed', 'vendor', 2, 60),
('VulnCheck', 'rss', 'https://vulncheck.com/blog/feed', 'vendor', 2, 60);

-- TIER 4: IOC / Threat Intel (abuse.ch etc., public)
INSERT INTO sources (name, type, url, category, tier, fetch_interval_min) VALUES
('URLhaus', 'api', 'https://urlhaus-api.abuse.ch/v1/', 'ioc', 1, 15),
('ThreatFox', 'api', 'https://threatfox-api.abuse.ch/v1/', 'ioc', 1, 15),
('MalwareBazaar', 'api', 'https://mb-api.abuse.ch/api/v1/', 'ioc', 1, 60),
('Feodo Tracker', 'csv', 'https://feodotracker.abuse.ch/downloads/ipblocklist.txt', 'ioc', 1, 60),
('SSL Blacklist', 'csv', 'https://sslbl.abuse.ch/blacklist/sslblacklist.csv', 'ioc', 1, 60),
('PhishTank', 'json', 'http://data.phishtank.com/data/online-valid.json', 'ioc', 2, 60),
('OpenPhish', 'csv', 'https://openphish.com/feed.txt', 'ioc', 2, 60),
('Ransomware Tracker', 'csv', 'https://ransomwaretracker.abuse.ch/feeds/csv/', 'ioc', 2, 60);

-- TIER 5: AI-Specific
INSERT INTO sources (name, type, url, category, tier, fetch_interval_min) VALUES
('AI Incident Database', 'api', 'https://incidentdatabase.ai/api/v1/incidents', 'ai', 1, 60),
('Lakera AI Blog', 'rss', 'https://www.lakera.ai/blog/rss.xml', 'ai', 2, 60),
('HiddenLayer Blog', 'rss', 'https://hiddenlayer.com/rss/', 'ai', 2, 60),
('arXiv cs.CR', 'api', 'http://export.arxiv.org/api/query?search_query=cat:cs.CR&sortBy=submittedDate&max_results=50', 'ai', 2, 60),
('arXiv cs.AI', 'api', 'http://export.arxiv.org/api/query?search_query=cat:cs.AI+AND+(security+OR+adversarial+OR+jailbreak)&sortBy=submittedDate&max_results=50', 'ai', 2, 60),
('arXiv cs.LG', 'api', 'http://export.arxiv.org/api/query?search_query=cat:cs.LG+AND+(adversarial+OR+attack)&sortBy=submittedDate&max_results=50', 'ai', 2, 60),
('PromptArmor', 'rss', 'https://www.promptarmor.com/rss.xml', 'ai', 2, 60),
('HuggingFace Advisories', 'api', 'https://huggingface.co/api/security-advisories', 'ai', 2, 120);

-- TIER 6: Türkçe / Yerel
INSERT INTO sources (name, type, url, category, tier, language, fetch_interval_min) VALUES
('USOM', 'rss', 'https://www.usom.gov.tr/rss/zararli-baglantilar.xml', 'local', 1, 'tr', 30),
('USOM Advisories', 'rss', 'https://www.usom.gov.tr/rss/bildirim.xml', 'local', 1, 'tr', 30),
('BTK Akademi Blog', 'rss', 'https://www.btkakademi.gov.tr/feed/', 'local', 2, 'tr', 60),
('STM Threat Intel', 'rss', 'https://www.stm.com.tr/feed', 'local', 2, 'tr', 60),
('HAVELSAN Blog', 'rss', 'https://www.havelsan.com.tr/feed', 'local', 2, 'tr', 60),
('Labris Networks', 'rss', 'https://www.labrisnetworks.com/blog/feed/', 'local', 2, 'tr', 60),
('Logsign', 'rss', 'https://www.logsign.com/blog/feed/', 'local', 2, 'tr', 60),
('Komtas Security', 'rss', 'https://www.komtas.com/blog/feed/', 'local', 2, 'tr', 60);

-- Initial MITRE techniques
INSERT INTO techniques (attack_id, name, tactic, description, is_atlas) VALUES
('T1059', 'Command and Scripting Interpreter', 'execution', 'Adversaries may abuse command and script interpreters to execute commands.', FALSE),
('T1566', 'Phishing', 'initial-access', 'Adversaries may send phishing messages to gain access to victim systems.', FALSE),
('T1190', 'Exploit Public-Facing Application', 'initial-access', 'Adversaries may attempt to take advantage of a weakness in an Internet-facing computer or program.', FALSE),
('T1078', 'Valid Accounts', 'defense-evasion', 'Adversaries may obtain and abuse credentials of existing accounts.', FALSE),
('T1486', 'Data Encrypted for Impact', 'impact', 'Adversaries may encrypt data on target systems or on large numbers of systems in a network to interrupt availability.', FALSE);

INSERT INTO techniques (attack_id, name, tactic, description, is_atlas) VALUES
('AML.T0051', 'LLM Prompt Injection', 'initial-access', 'Crafting prompts to manipulate LLM behavior or extract information.', TRUE),
('AML.T0024', 'Exfiltration via Cyber Means', 'exfiltration', 'Adversaries may exfiltrate data from ML systems through cyber means.', TRUE),
('AML.T0048', 'Erode ML Model Integrity', 'evasion', 'Adversarial inputs that cause ML models to behave incorrectly.', TRUE),
('AML.T0019', 'Publish Poisoned Datasets', 'initial-access', 'Adversaries may publish datasets that have been poisoned to compromise ML models.', TRUE),
('AML.T0020', 'Poison Training Data', 'initial-access', 'Adversaries may poison training data used to train ML models.', TRUE);

-- Initial known actors
INSERT INTO actors (name, type, description) VALUES
('Conti', 'cybercrime', 'Russian-based ransomware group, dissolved in 2022 but affiliates continue.'),
('LockBit', 'cybercrime', 'Ransomware-as-a-Service operation, one of the most prolific.'),
('Clop', 'cybercrime', 'Ransomware group known for exploiting zero-days in file transfer software.'),
('Lazarus', 'state', 'North Korean state-sponsored group targeting financial and crypto assets.'),
('Kimsuky', 'state', 'North Korean threat actor focused on espionage.'),
('Mustang Panda', 'state', 'Chinese state-sponsored group targeting government and telecom.'),
('APT28', 'state', 'Russian military intelligence (GRU) cyber espionage group.'),
('APT29', 'state', 'Russian SVR cyber espionage group, targets governments and think tanks.'),
('Scattered Spider', 'cybercrime', 'English-speaking threat actor targeting telecom and BPO sectors.'),
('UNC3886', 'state', 'China-linked APT targeting virtualization and networking infrastructure.');

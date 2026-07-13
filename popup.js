/* ──────────────────────────────────────────────────────────────
   Northwell FDA Drug Approval Monitor – popup.js (upgraded)
   Improvements:
     1. Concurrency-limited indication fetches (batches of 6)
     2. Retry with exponential back-off on 429 / 5xx errors
     3. XML builder helpers (xmlCell, xmlRow, xmlStyle, xmlBorders)
     4. Live progress counter during long fetches
     5. chrome.storage.local result caching (10-minute TTL)
     6. Weighted specialty scoring instead of first-match
   ────────────────────────────────────────────────────────────── */

/* ── constants ─────────────────────────────────────────────── */
var CONCURRENCY_LIMIT = 6;
var MAX_RETRIES = 4;
var RETRY_BASE_MS = 600;
var CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/* ── boot ──────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", function () {
  var today = new Date();
  var monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  document.getElementById("dateTo").value = formatDateInput(today);
  document.getElementById("dateFrom").value = formatDateInput(monthStart);

  document
    .getElementById("downloadBtn")
    .addEventListener("click", fetchAndDownload);

  var masterBtn = document.getElementById("updateMasterBtn");

  if (masterBtn) {
    masterBtn.addEventListener("click", updateMasterSpreadsheet);
  }
});

/* ── date helpers ──────────────────────────────────────────── */
function formatDateInput(date) {
  var y = date.getFullYear();
  var m = String(date.getMonth() + 1).padStart(2, "0");
  var d = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

function formatDateFDA(dateStr) {
  return dateStr.replace(/-/g, "");
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return "N/A";
  var months = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];
  var parts = dateStr.split("-");
  if (parts.length === 3) {
    var mi = parseInt(parts[1], 10) - 1;
    return months[mi] + " " + parseInt(parts[2], 10) + ", " + parts[0];
  }
  return dateStr;
}

function formatDateMMDDYYYY(fdaDate) {
  if (!fdaDate || fdaDate.length !== 8) return "N/A";
  return fdaDate.substring(4, 6) + "/" +
    fdaDate.substring(6, 8) + "/" +
    fdaDate.substring(0, 4);
}

function getPdufaQuarter(fdaDate) {
  if (!fdaDate || fdaDate.length !== 8) return "N/A";
  var month = parseInt(fdaDate.substring(4, 6), 10);
  if (month <= 3) return "Q1";
  if (month <= 6) return "Q2";
  if (month <= 9) return "Q3";
  return "Q4";
}

function getPdufaYear(fdaDate) {
  if (!fdaDate || fdaDate.length !== 8) return "N/A";
  return fdaDate.substring(0, 4);
}

/* ── status / UI ───────────────────────────────────────────── */
function setStatus(type, message) {
  var el = document.getElementById("status");
  el.className = "status " + type;
  el.innerHTML = message;
}

/* ── text helpers ──────────────────────────────────────────── */
function cleanText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function getFirst(value) {
  if (!value) return "";
  if (Array.isArray(value)) return value.length > 0 ? value[0] : "";
  return value;
}

function toTitleCase(value) {
  var text = cleanText(value);
  if (!text) return "";
  var keepUpper = {
    "FDA":true,"BLA":true,"NDA":true,"ANDA":true,"IV":true,
    "SUBQ":true,"LLC":true,"INC":true,"USA":true,"US":true,"GSK":true
  };
  return text.toLowerCase().split(" ").map(function (word) {
    var cleaned = word.replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (keepUpper[cleaned]) return cleaned;
    if (!word) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(" ");
}

function normalizeManufacturer(value) {
  var text = cleanText(value);
  if (!text) return "Unknown";
  var overrides = {
    "ABBVIE":"Abbvie","PFIZER":"Pfizer","MERCK":"Merck",
    "MERCK SHARP DOHME":"Merck","ASTRAZENECA":"AstraZeneca",
    "GILEAD SCIENCES":"Gilead","GILEAD":"Gilead",
    "GLAXOSMITHKLINE":"GSK","GLAXOSMITHKLINE LLC":"GSK",
    "BAYER":"Bayer","SANOFI":"Sanofi",
    "LUPIN":"Lupin Limited","LUPIN LTD":"Lupin Limited"
  };
  var upper = text.toUpperCase();
  for (var key in overrides) {
    if (upper.indexOf(key) !== -1) return overrides[key];
  }
  return toTitleCase(text);
}

function escapeXml(str) {
  if (str === undefined || str === null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/* ── submission helpers ────────────────────────────────────── */
function getSubmissionClassification(sub) {
  var code = cleanText(sub.submission_class_code);
  var desc = cleanText(sub.submission_class_code_description);
  if (!code && !desc) return "--";
  if (code && desc) return code + " - " + desc;
  return desc || code;
}

function shouldIncludeForFDAReport(sub) {
  var code = cleanText(sub.submission_class_code);
  var desc = cleanText(sub.submission_class_code_description);
  var classification = getSubmissionClassification(sub);
  var combined = cleanText(code + " " + desc + " " + classification).toUpperCase();
  if (!combined || combined === "--" || combined === "N/A" ||
      combined === "NULL" || combined === "UNDEFINED") return true;
  if (combined.indexOf("EFFICACY") === 0) return true;
  if (combined.indexOf("TYPE") === 0) return true;
  if (combined.indexOf(" EFFICACY") !== -1) return true;
  if (combined.indexOf(" TYPE") !== -1) return true;
  if (combined.indexOf("BIOEQUIV") !== -1) return true;
  if (combined.indexOf("BIOSIMILAR") !== -1) return true;
  return false;
}

function deriveSubmissionType(applicationNumber, submissionType) {
  var app = cleanText(applicationNumber).toUpperCase();
  var type = cleanText(submissionType).toUpperCase();
  var isBla = app.indexOf("BLA") === 0;
  var isNda = app.indexOf("NDA") === 0;
  var isAnda = app.indexOf("ANDA") === 0;

  if (type === "ORIG") {
    if (isBla) return "BLA";
    if (isNda) return "NDA";
    if (isAnda) return "ANDA";
    return "Original";
  }
  if (type === "SUPPL") {
    if (isBla) return "sBLA";
    if (isNda) return "sNDA";
    if (isAnda) return "sANDA";
    return "Supplement";
  }
  if (type === "ABBR") return "ANDA";
  return type || "Unknown";
}

/* ── route helpers ─────────────────────────────────────────── */
function cleanRouteValue(route) {
  if (Array.isArray(route)) return route.join(" ");
  return cleanText(route);
}

function simplifyRoute(route, dosageForm) {
  var r = cleanRouteValue(route).toUpperCase();
  var d = cleanText(dosageForm).toUpperCase();

  if (r.indexOf("INTRAVENOUS") !== -1 || r === "IV") return "IV";
  if (r.indexOf("SUBCUTANEOUS") !== -1 || r.indexOf("SUB-Q") !== -1 ||
      r.indexOf("SUBQ") !== -1) return "SUBQ";
  if (r.indexOf("ORAL") !== -1 || r.indexOf("BY MOUTH") !== -1) return "Oral";
  if (r.indexOf("OPHTHALMIC") !== -1 || r.indexOf("INTRAOCULAR") !== -1) return "Ophthalmic";
  if (r.indexOf("INJECTION") !== -1 || d.indexOf("INJECTION") !== -1 ||
      d.indexOf("INJECTABLE") !== -1) return "Injectable Other";
  if (r.indexOf("BUCCAL") !== -1) return "Buccal";
  if (r.indexOf("TOPICAL") !== -1) return "Topical";
  if (r.indexOf("TRANSDERMAL") !== -1) return "Transdermal";
  if (r.indexOf("INHALATION") !== -1) return "Inhalation";
  if (!r || r === "UNKNOWN") return "Unknown";
  return toTitleCase(r);
}

function buildDrugDisplayName(brandName, genericName) {
  var brand = cleanText(brandName);
  var generic = cleanText(genericName);
  if (!brand && !generic) return "Unknown";
  var displayBrand = toTitleCase(brand);
  if (generic && generic.toUpperCase() !== "UNKNOWN") {
    return displayBrand + " (" + generic.toLowerCase() + ")";
  }
  return displayBrand || generic;
}

function cleanIndication(text) {
  if (!text) return "N/A";
  text = String(text)
    .replace(/\s+/g, " ")
    .replace(/^1\s+/i, "")
    .replace(/^INDICATIONS AND USAGE\s*/i, "")
    .replace(/^INDICATIONS\s*/i, "")
    .trim();
  if (text.length > 550) text = text.substring(0, 550) + "...";
  return text;
}

/* ──────────────────────────────────────────────────────────────
   UPGRADE 2 — fetchWithRetry: exponential back-off on 429/5xx
   ────────────────────────────────────────────────────────────── */
function fetchWithRetry(url, attempt) {
  if (attempt === undefined) attempt = 0;

  return fetch(url).then(function (response) {
    if (response.status === 429 || response.status >= 500) {
      if (attempt >= MAX_RETRIES) {
        throw new Error("API request failed after " + MAX_RETRIES +
          " retries (status " + response.status + ")");
      }
      var delayMs = RETRY_BASE_MS * Math.pow(2, attempt);
      return new Promise(function (resolve) {
        setTimeout(resolve, delayMs);
      }).then(function () {
        return fetchWithRetry(url, attempt + 1);
      });
    }
    return response;
  });
}

/* ──────────────────────────────────────────────────────────────
   UPGRADE 1 — runWithConcurrency: limit parallel fetches
   ────────────────────────────────────────────────────────────── */
function runWithConcurrency(tasks, limit, onProgress) {
  var results = new Array(tasks.length);
  var next = 0;
  var active = 0;
  var completed = 0;

  return new Promise(function (resolve, reject) {
    function launch() {
      while (active < limit && next < tasks.length) {
        (function (idx) {
          active++;
          next++;
          tasks[idx]()
            .then(function (val) { results[idx] = val; })
            .catch(function (err) { results[idx] = err; })
            .then(function () {
              active--;
              completed++;
              if (onProgress) onProgress(completed, tasks.length);
              if (completed === tasks.length) {
                resolve(results);
              } else {
                launch();
              }
            });
        })(next);
      }
    }
    if (tasks.length === 0) return resolve([]);
    launch();
  });
}

/* ── indication fetcher (now uses retry) ───────────────────── */
function fetchIndicationForApproval(approval) {
  var appNumber = cleanText(approval.application_number);
  var brand = cleanText(approval.brand_name);
  var generic = cleanText(approval.generic_name);

  var searches = [];
  if (appNumber) searches.push('openfda.application_number:"' + appNumber + '"');
  if (brand) searches.push('openfda.brand_name:"' + brand + '"');
  if (generic) searches.push('openfda.generic_name:"' + generic + '"');

  function trySearch(index) {
    if (index >= searches.length) return Promise.resolve({ indication: "N/A", label_pharm_class: "" });

    var url = "https://api.fda.gov/drug/label.json?search=" +
      encodeURIComponent(searches[index]) + "&limit=1";

    return fetchWithRetry(url)
      .then(function (response) {
        if (!response.ok) return trySearch(index + 1);
        return response.json().then(function (data) {
          var results = data.results || [];
          if (results.length === 0) return trySearch(index + 1);
          var label = results[0];
          var ind = label.indications_and_usage || [];
          var indicationText = "";
          if (ind.length > 0 && ind[0]) {
            indicationText = cleanIndication(ind[0]);
          } else {
            var purpose = label.purpose || [];
            if (purpose.length > 0 && purpose[0]) {
              indicationText = cleanIndication(purpose[0]);
            }
          }
          if (!indicationText) return trySearch(index + 1);
          var labelOf = label.openfda || {};
          var labelPharmClass = [].concat(
            labelOf.pharm_class_epc || [],
            labelOf.pharm_class_moa || [],
            labelOf.pharm_class_pe || []
          ).join("; ");
          return { indication: indicationText, label_pharm_class: labelPharmClass };
        });
      })
      .catch(function () { return trySearch(index + 1); });
  }

  return trySearch(0);
}

/* ──────────────────────────────────────────────────────────────
   UPGRADE 6 — Weighted specialty scoring
   ────────────────────────────────────────────────────────────── */
function mapIndicationToSpecialty(indication, drugName, genericName, pharmClassEpc, pharmClassMoa, labelPharmClass) {
  var text = (
    cleanText(indication) + " " +
    cleanText(drugName) + " " +
    cleanText(genericName) + " " +
    cleanText(pharmClassEpc) + " " +
    cleanText(pharmClassMoa) + " " +
    cleanText(labelPharmClass)
  ).toLowerCase();

  /* Each rule has a base weight; longer/more-specific keywords get a
     bonus so "breast cancer" (13 chars) scores higher than "pain" (4). */
  var rules = [
    { keywords:["plaque psoriasis","psoriasis","acne","dermatitis","eczema",
                "hidradenitis","dermatology"], specialty:"Dermatology", weight:3 },
    { keywords:["hemophilia","haemophilia","bleeding episode","factor viii",
                "factor ix","hematology","anaemia","anemia"], specialty:"Hematology", weight:3 },
    { keywords:["cancer","tumor","tumour","carcinoma","lymphoma","leukemia",
                "leukaemia","melanoma","metastatic","breast cancer",
                "renal cell carcinoma","tnbc","adjuvant treatment","oncology",
                "chemotherapy","antiemetic","nausea and vomiting associated"],
      specialty:"Oncology", weight:4 },
    { keywords:["neuromyelitis","nmosd","seizure","epilepsy","spasticity",
                "cerebral palsy","neurology","migraine","complement inhibitor",
                "myasthenia gravis","paroxysmal nocturnal"],
      specialty:"Neurology", weight:3 },
    { keywords:["thyroid eye disease","retinal","retina","ophthalmic",
                "ophthalmology","macular","eye","vascular endothelial growth factor",
                "vegf inhibitor","intravitreal"], specialty:"Ophthalmology", weight:3 },
    { keywords:["contrast","imaging","radiology","vascularity",
                "computed tomography","magnetic resonance"], specialty:"Radiology", weight:2 },
    { keywords:["urinary","bladder","urology","kidney stone","prostate",
                "urinary tract","cystine","cystinuria","nephrolithiasis",
                "urinary tract infection","pyelonephritis","uti"],
      specialty:"Urology", weight:3 },
    { keywords:["diabetes","glucagon","thyroid","osteoporosis",
                "hyperthyroidism","endocrine","metabolic","hypoglycemia",
                "triglyceride","hypertriglyceridemia","lipid","cholesterol",
                "pancreatitis"],
      specialty:"Endocrinology / Metabolic", weight:3 },
    { keywords:["arthritis","rheumatoid","lupus","ankylosing","rheumatology",
                "baricitinib","psoriatic arthritis","interleukin inhibitor",
                "il-23","il-17"], specialty:"Rheumatology", weight:3 },
    { keywords:["hypertension","heart failure","cardiac","cardiovascular",
                "angina","arrhythmia","atrial fibrillation","blood pressure"],
      specialty:"Cardiology", weight:3 },
    { keywords:["asthma","copd","pulmonary","respiratory","eosinophilic"],
      specialty:"Pulmonology", weight:3 },
    { keywords:["infection","antibacterial","antiviral","antibiotic",
                "microorganism","infectious","susceptible"],
      specialty:"Infectious Disease", weight:3 },
    { keywords:["opioid","naloxone","overdose","pain","analgesic","emergency"],
      specialty:"Emergency Medicine", weight:2 },
    { keywords:["contracepti","pregnancy","estradiol","vaginal","obstetric",
                "gynecologic"], specialty:"OB/GYN", weight:3 },
    { keywords:["renal","kidney","nephrology"], specialty:"Nephrology", weight:3 },
    { keywords:["liver","hepatic","gastrointestinal","ulcerative colitis",
                "crohn"], specialty:"Gastroenterology", weight:3 },
    { keywords:["schizophrenia","bipolar","antipsychotic","depression",
                "psychiatry"], specialty:"Psychiatry", weight:3 }
  ];

  var scores = {};

  for (var i = 0; i < rules.length; i++) {
    var rule = rules[i];
    for (var j = 0; j < rule.keywords.length; j++) {
      if (text.indexOf(rule.keywords[j]) !== -1) {
        var bonus = Math.floor(rule.keywords[j].length / 4);
        var pts = rule.weight + bonus;
        scores[rule.specialty] = (scores[rule.specialty] || 0) + pts;
      }
    }
  }

  var best = null;
  var bestScore = 0;
  for (var spec in scores) {
    if (scores[spec] > bestScore) {
      bestScore = scores[spec];
      best = spec;
    }
  }

  return best || "General / Review Needed";
}

/* ── FDA record paginator (uses retry) ─────────────────────── */
function fetchAllDrugsFdaRecords(searchQuery) {
  var all = [];
  var limit = 100;
  var skip = 0;

  function fetchPage() {
    var url = "https://api.fda.gov/drug/drugsfda.json?search=" +
      encodeURIComponent(searchQuery) +
      "&limit=" + limit + "&skip=" + skip;

    return fetchWithRetry(url)
      .then(function (response) {
        if (response.status === 404) return all;
        if (!response.ok) throw new Error("FDA API error: " + response.status);
        return response.json();
      })
      .then(function (data) {
        if (!data || !data.results) return all;
        all = all.concat(data.results);
        if (data.results.length < limit) return all;
        skip += limit;
        return fetchPage();
      });
  }

  return fetchPage();
}

/* ──────────────────────────────────────────────────────────────
   UPGRADE 5 — chrome.storage.local caching
   ────────────────────────────────────────────────────────────── */
function getCachedResults(cacheKey) {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
    return Promise.resolve(null);
  }
  return new Promise(function (resolve) {
    chrome.storage.local.get(cacheKey, function (items) {
      var entry = items[cacheKey];
      if (!entry) return resolve(null);
      if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        chrome.storage.local.remove(cacheKey);
        return resolve(null);
      }
      resolve(entry.data);
    });
  });
}

function setCachedResults(cacheKey, data) {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
  var obj = {};
  obj[cacheKey] = { data: data, timestamp: Date.now() };
  chrome.storage.local.set(obj);
}

/* ── master button handler (now returns promise properly) ──── */
function updateMasterSpreadsheet() {
  setStatus("loading", "Building master report for the past 2 years...");

  var today = new Date();
  var twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(today.getFullYear() - 2);

  var fromDate = formatDateInput(twoYearsAgo);
  var toDate = formatDateInput(today);

  document.getElementById("dateFrom").value = fromDate;
  document.getElementById("dateTo").value = toDate;

  return fetchAndDownload().catch(function (err) {
    setStatus("error", err.message);
  });
}

function normalizeFdaDocUrl(url) {
  if (!url) return "";

  url = cleanText(url);

  // If FDA gives a complete URL, use it directly.
  if (url.indexOf("http://") === 0 || url.indexOf("https://") === 0) {
    return url;
  }

  // If FDA gives a relative path, attach the FDA host.
  if (url.indexOf("/") === 0) {
    return "https://www.accessdata.fda.gov" + url;
  }

  return url;
}

function buildApprovalLetterUrlFromDoc(doc, fallbackDate) {
  if (!doc) return "";

  var directUrl =
    doc.url ||
    doc.document_url ||
    doc.link ||
    doc.href ||
    doc.file_url ||
    "";

  if (directUrl) {
    return normalizeFdaDocUrl(directUrl);
  }

  var docId = cleanText(doc.id);
  if (!docId) return "";

  var docDate = cleanText(doc.date) || cleanText(fallbackDate);
  var year = "";

  if (docDate.length >= 4) {
    year = docDate.substring(0, 4);
  }

  if (!year) return "";

  // Example FDA approval letter pattern:
  // https://www.accessdata.fda.gov/drugsatfda_docs/appletter/2026/761275Orig1s022ltr.pdf
  if (docId.toLowerCase().indexOf(".pdf") === -1) {
    docId = docId + ".pdf";
  }

  return "https://www.accessdata.fda.gov/drugsatfda_docs/appletter/" +
    year + "/" + docId;
}

function getApprovalLetterLink(sub, fallbackDate) {
  if (!sub || !sub.application_docs || !Array.isArray(sub.application_docs)) {
    return "";
  }

  var docs = sub.application_docs;

  // First pass: strongest match — approval letter / app letter / action letter
  for (var i = 0; i < docs.length; i++) {
    var doc = docs[i];
    var title = cleanText(doc.title).toLowerCase();
    var type = cleanText(doc.type).toLowerCase();
    var combined = title + " " + type;

    if (
      combined.indexOf("approval") !== -1 ||
      combined.indexOf("appletter") !== -1 ||
      combined.indexOf("app letter") !== -1 ||
      combined.indexOf("action letter") !== -1 ||
      combined.indexOf("letter") !== -1
    ) {
      var url = buildApprovalLetterUrlFromDoc(doc, fallbackDate);
      if (url) return url;
    }
  }

  // Second pass: if no title match, use the first PDF-looking document.
  for (var j = 0; j < docs.length; j++) {
    var fallbackDoc = docs[j];
    var fallbackUrl = buildApprovalLetterUrlFromDoc(fallbackDoc, fallbackDate);

    if (fallbackUrl && fallbackUrl.toLowerCase().indexOf(".pdf") !== -1) {
      return fallbackUrl;
    }
  }

  return "";
}



/* ── main fetch & download flow ────────────────────────────── */
function fetchAndDownload() {
  var btn = document.getElementById("downloadBtn");
  var masterBtn = document.getElementById("updateMasterBtn");

  btn.disabled = true;
  if (masterBtn) masterBtn.disabled = true;

  function enableButtons() {
    btn.disabled = false;
    if (masterBtn) masterBtn.disabled = false;
  }

  var fromDate = document.getElementById("dateFrom").value;
  var toDate = document.getElementById("dateTo").value;

  if (!fromDate || !toDate) {
    setStatus("error", "Please select both dates.");
    enableButtons();
    return Promise.resolve();
  }

  var fdaFrom = formatDateFDA(fromDate);
  var fdaTo = formatDateFDA(toDate);
  var cacheKey = "fda_" + fdaFrom + "_" + fdaTo;

  /* UPGRADE 5 — check cache first */
  return getCachedResults(cacheKey).then(function (cached) {
    if (cached) {
      setStatus("loading", "Using cached results (" + cached.length + " approvals)...");
      generateFDAExcel(cached, fromDate, toDate);
      setStatus("success", "Downloaded " + cached.length +
        " FDA approval(s) from cache.");
      enableButtons();
      return;
    }

    setStatus("loading", "Fetching Drugs@FDA approvals...");

    var searchQuery = "submissions.submission_status_date:[" +
      fdaFrom + " TO " + fdaTo + "]";

    return fetchAllDrugsFdaRecords(searchQuery)
      .then(function (results) {
        if (!results || results.length === 0) {
          setStatus("error", "No drug records found for this date range.");
          enableButtons();
          return;
        }

        setStatus("loading",
          "Processing " + results.length + " Drugs@FDA record(s)...");

        var approvals = [];
        var seen = {};

        for (var i = 0; i < results.length; i++) {
          var drug = results[i];
          var submissions = drug.submissions || [];
          var products = drug.products || [];
          var openfda = drug.openfda || {};
          var appNum = drug.application_number || "Unknown";

          if (appNum.toUpperCase().indexOf("ANDA") === 0) continue;

          for (var j = 0; j < submissions.length; j++) {
            var sub = submissions[j];
            var subDate = cleanText(sub.submission_status_date);
            var subStatus = cleanText(sub.submission_status).toUpperCase();
            if (!subDate || subStatus !== "AP") continue;

            var subInt = parseInt(subDate, 10);
            if (subInt < parseInt(fdaFrom, 10) || subInt > parseInt(fdaTo, 10)) continue;
            if (!shouldIncludeForFDAReport(sub)) continue;

            var classification = getSubmissionClassification(sub);
            var key = appNum + "_" + subDate;
            if (seen[key]) continue;
            seen[key] = true;

            var product = products.length > 0 ? products[0] : {};
            var brandName = product.brand_name ||
              getFirst(openfda.brand_name) || "Unknown";
            var genericName = getFirst(openfda.generic_name) ||
              getFirst(openfda.substance_name) || "Unknown";
            if (genericName === "Unknown" && product.active_ingredients &&
                product.active_ingredients.length > 0) {
              genericName = product.active_ingredients[0].name || "Unknown";
            }
            var dosageForm = product.dosage_form ||
              getFirst(openfda.dosage_form) || "Unknown";
            var rawRoute = product.route ||
              getFirst(openfda.route) || "Unknown";

            approvals.push({
              manufacturer: normalizeManufacturer(drug.sponsor_name || "Unknown"),
              drug_name: buildDrugDisplayName(brandName, genericName),
              brand_name: brandName,
              generic_name: genericName,
              submission_type: deriveSubmissionType(appNum, sub.submission_type),
              therapeutic_specialty_category: "",
              indication: "",
              pharm_class_epc: (openfda.pharm_class_epc || []).join("; "),
              pharm_class_moa: (openfda.pharm_class_moa || []).join("; "),
              route_of_admin: simplifyRoute(rawRoute, dosageForm),
              pdufa_date: formatDateMMDDYYYY(subDate),
              pdufa_quarter: getPdufaQuarter(subDate),
              pdufa_year: getPdufaYear(subDate),
              submission_classification: classification,
              application_number: appNum,
              approval_date_raw: subDate,
              sponsor: drug.sponsor_name || "Unknown",
              dosage_form: dosageForm,
              letter_link: getApprovalLetterLink(sub, subDate)
            });
          }
        }

        if (approvals.length === 0) {
          setStatus("error",
            "No qualifying FDA approvals found. The range may not contain Efficacy, Type, or blank/null classifications.");
          enableButtons();
          return;
        }

        /* UPGRADE 1 + 4 — concurrency-limited indication fetches
           with live progress counter */
        setStatus("loading",
          "Fetching indications: 0 / " + approvals.length + "...");

        var tasks = approvals.map(function (approval) {
          return function () { return fetchIndicationForApproval(approval); };
        });

        return runWithConcurrency(tasks, CONCURRENCY_LIMIT,
          function (done, total) {
            setStatus("loading",
              "Fetching indications: " + done + " / " + total + "...");
          }
        ).then(function (indResults) {
          for (var b = 0; b < approvals.length; b++) {
            var res = indResults[b] || {};
            approvals[b].indication = (res.indication ? res.indication : res) || "N/A";
            var labelPharm = res.label_pharm_class || "";
            approvals[b].therapeutic_specialty_category =
              mapIndicationToSpecialty(
                approvals[b].indication,
                approvals[b].drug_name,
                approvals[b].generic_name,
                approvals[b].pharm_class_epc,
                approvals[b].pharm_class_moa,
                labelPharm
              );
          }

          approvals.sort(function (a, b) {
            if (a.approval_date_raw !== b.approval_date_raw)
              return a.approval_date_raw.localeCompare(b.approval_date_raw);
            return a.drug_name.localeCompare(b.drug_name);
          });

          /* UPGRADE 5 — persist to cache */
          setCachedResults(cacheKey, approvals);

          setStatus("loading", "Generating FDA Excel report...");
          generateFDAExcel(approvals, fromDate, toDate);
          setStatus("success",
            "Downloaded " + approvals.length + " FDA approval(s).");
          enableButtons();
        });
      })
      .catch(function (err) {
        setStatus("error", "Error: " + err.message);
        enableButtons();
      });
  });
}

/* ──────────────────────────────────────────────────────────────
   UPGRADE 3 — XML builder helpers
   ────────────────────────────────────────────────────────────── */
function xmlBorders() {
  return '<Borders>' +
    '<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>' +
    '<Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>' +
    '<Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>' +
    '<Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>' +
    '</Borders>';
}

function xmlStyle(id, opts) {
  var s = '<Style ss:ID="' + id + '">';
  s += '<Font ss:FontName="Calibri" ss:Size="11"';
  if (opts.bold) s += ' ss:Bold="1"';
  if (opts.fontColor) s += ' ss:Color="' + opts.fontColor + '"';
  s += '/>';
  if (opts.bgColor) {
    s += '<Interior ss:Color="' + opts.bgColor + '" ss:Pattern="Solid"/>';
  }
  var hAlign = opts.hAlign || "Center";
  var vAlign = opts.vAlign || "Center";
  s += '<Alignment ss:Horizontal="' + hAlign +
    '" ss:Vertical="' + vAlign + '" ss:WrapText="1"/>';
  s += xmlBorders();
  s += '</Style>';
  return s;
}

function xmlCell(styleId, value) {
  return '<Cell ss:StyleID="' + styleId +
    '"><Data ss:Type="String">' + escapeXml(value) +
    '</Data></Cell>';
}

function xmlHyperlinkCell(styleId, displayText, href) {
  if (!href) {
    return xmlCell(styleId, "N/A");
  }

  return '<Cell ss:StyleID="' + styleId +
    '" ss:HRef="' + escapeXml(href) +
    '"><Data ss:Type="String">' + escapeXml(displayText) +
    '</Data></Cell>';
}


function xmlRow(cells, attrs) {
  var tag = '<Row';
  if (attrs) tag += ' ' + attrs;
  tag += '>';
  return tag + cells.join('') + '</Row>\n';
}

/* ── Excel generator (refactored with helpers) ─────────────── */
function generateFDAExcel(approvals, fromDate, toDate) {
  var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<?mso-application progid="Excel.Sheet"?>\n';
  xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n';
  xml += ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"\n';
  xml += ' xmlns:x="urn:schemas-microsoft-com:office:excel">\n';

  /* ── styles ── */
  xml += '<Styles>\n';
  xml += xmlStyle("header", { bold:true, fontColor:"#FFFFFF", bgColor:"#156082" }) + '\n';
  xml += xmlStyle("dataBlue", { bgColor:"#C0E6F5" }) + '\n';
  xml += xmlStyle("dataWhite", { bgColor:"#FFFFFF" }) + '\n';
  xml += xmlStyle("indicationBlue", { bgColor:"#C0E6F5", hAlign:"Left", vAlign:"Top" }) + '\n';
  xml += xmlStyle("indicationWhite", { bgColor:"#FFFFFF", hAlign:"Left", vAlign:"Top" }) + '\n';
  xml += '</Styles>\n';

  /* ── Sheet 1: FDA Approvals ── */
  xml += '<Worksheet ss:Name="FDA Approvals">\n';
  xml += '<Table ss:DefaultRowHeight="18">\n';

  var colWidths = [150, 180, 120, 170, 420, 145, 125, 125, 125, 300, 700];
  for (var w = 0; w < colWidths.length; w++) {
    xml += '<Column ss:Width="' + colWidths[w] + '"/>\n';
  }


  
  var headers = [
    "Manufacturer","Drug name","Submission Type",
    "Therapeutic Specialty Category","Indication","Route of Admin",
    "PDUFA Date","PDUFA Quarter","PDUFA Year","Submission Classification",
    "Letter Link"
  ];

  xml += xmlRow(headers.map(function (h) {
    return xmlCell("header", h);
  }), 'ss:Height="22"');

  for (var i = 0; i < approvals.length; i++) {
    var a = approvals[i];
    var ns = i % 2 === 0 ? "dataBlue" : "dataWhite";
    var is = i % 2 === 0 ? "indicationBlue" : "indicationWhite";

        var fields = [
      a.manufacturer, a.drug_name, a.submission_type,
      a.therapeutic_specialty_category, a.indication, a.route_of_admin,
      a.pdufa_date, a.pdufa_quarter, a.pdufa_year, a.submission_classification
    ];

    var cells = fields.map(function (val, c) {
      return xmlCell(c === 4 ? is : ns, val);
    });

    cells.push(xmlHyperlinkCell(ns, a.letter_link, a.letter_link));

    xml += xmlRow(cells, 'ss:AutoFitHeight="1"');
  }

  xml += '</Table>\n';
  xml += '<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">\n';
  xml += '<FreezePanes/><FrozenNoSplit/>\n';
  xml += '<SplitHorizontal>1</SplitHorizontal>\n';
  xml += '<TopRowBottomPane>1</TopRowBottomPane>\n';
  xml += '<ActivePane>2</ActivePane>\n';
  xml += '</WorksheetOptions>\n';
  xml += '</Worksheet>\n';

  /* ── Sheet 2: Validation Notes ── */
  xml += '<Worksheet ss:Name="Validation Notes">\n';
  xml += '<Table ss:DefaultRowHeight="20">\n';
  xml += '<Column ss:Width="220"/><Column ss:Width="520"/>\n';

  xml += xmlRow([xmlCell("header", "Field"), xmlCell("header", "Value")]);

  var notes = [
    ["Report Type", "FDA Drug Approval Report"],
    ["Date Range", formatDateDisplay(fromDate) + " to " + formatDateDisplay(toDate)],
    ["Total Included Rows", String(approvals.length)],
    ["Primary Source", "openFDA Drugs@FDA endpoint"],
    ["Supplemental Source", "openFDA Product Labeling endpoint for indication text"],
    ["Included Submission Classifications", "Efficacy, Type, Bioequivalence, Biosimilar classifications, and blank/null/-- classifications"],
    ["Excluded Submission Classifications", "LABELING, REMS, MANUF (CMC), and other non-target classifications"],
    ["Excluded Application Type", "ANDA records are excluded by default"]
  ];

  for (var n = 0; n < notes.length; n++) {
    xml += xmlRow([
      xmlCell("dataBlue", notes[n][0]),
      xmlCell("dataWhite", notes[n][1])
    ]);
  }

  xml += '</Table>\n</Worksheet>\n</Workbook>';

  /* ── trigger download ── */
  var blob = new Blob([xml], { type: "application/vnd.ms-excel" });
  var url = URL.createObjectURL(blob);
  var link = document.createElement("a");
  link.href = url;
  link.download = "FDA_Drug_Approval_Report_" + fromDate + "_to_" + toDate + ".xls";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

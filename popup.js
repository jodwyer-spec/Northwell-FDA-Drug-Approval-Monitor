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
    "January", "February", "March", "April",  
    "May", "June", "July", "August",  
    "September", "October", "November", "December"  
  ];

  var parts = dateStr.split("-");

  if (parts.length === 3) {  
    var mi = parseInt(parts[1], 10) - 1;  
    return months[mi] + " " + parseInt(parts[2], 10) + ", " + parts[0];  
  }

  return dateStr;  
}

function setStatus(type, message) {  
  var el = document.getElementById("status");  
  el.className = "status " + type;  
  el.innerHTML = message;  
}

function cleanText(value) {  
  if (value === undefined || value === null) return "";  
  return String(value).trim();  
}

function getFirst(value) {  
  if (!value) return "";

  if (Array.isArray(value)) {  
    return value.length > 0 ? value[0] : "";  
  }

  return value;  
}

function toTitleCase(value) {  
  var text = cleanText(value);

  if (!text) return "";

  var keepUpper = {  
    "FDA": true,  
    "BLA": true,  
    "NDA": true,  
    "ANDA": true,  
    "IV": true,  
    "SUBQ": true,  
    "LLC": true,  
    "INC": true,  
    "USA": true,  
    "US": true,  
    "GSK": true  
  };

  return text  
    .toLowerCase()  
    .split(" ")  
    .map(function (word) {  
      var cleaned = word.replace(/[^a-z0-9]/gi, "").toUpperCase();

      if (keepUpper[cleaned]) {  
        return cleaned;  
      }

      if (!word) return word;

      return word.charAt(0).toUpperCase() + word.slice(1);  
    })  
    .join(" ");  
}

function normalizeManufacturer(value) {  
  var text = cleanText(value);

  if (!text) return "Unknown";

  var overrides = {  
    "ABBVIE": "Abbvie",  
    "PFIZER": "Pfizer",  
    "MERCK": "Merck",  
    "MERCK SHARP DOHME": "Merck",  
    "ASTRAZENECA": "AstraZeneca",  
    "GILEAD SCIENCES": "Gilead",  
    "GILEAD": "Gilead",  
    "GLAXOSMITHKLINE": "GSK",  
    "GLAXOSMITHKLINE LLC": "GSK",  
    "BAYER": "Bayer",  
    "SANOFI": "Sanofi",  
    "LUPIN": "Lupin Limited",  
    "LUPIN LTD": "Lupin Limited"  
  };

  var upper = text.toUpperCase();

  for (var key in overrides) {  
    if (upper.indexOf(key) !== -1) {  
      return overrides[key];  
    }  
  }

  return toTitleCase(text);  
} 

function escapeXml(str) {  
  if (str === undefined || str === null) return "";  
  var s = String(str);  
  s = s.split("&").join("&");  
  s = s.split("<").join("<");  
  s = s.split(">").join(">");  
  s = s.split('"').join(""");  
  s = s.split("'").join("'");  
  return s;  
}  

function getSubmissionClassification(sub) {  
  var code = cleanText(sub.submission_class_code);  
  var desc = cleanText(sub.submission_class_code_description);

  if (!code && !desc) return "--";

  if (code && desc) {  
    return code + " - " + desc;  
  }

  if (desc) return desc;  
  return code;  
}

function getApprovalLetterUrl(sub) {  
  var docs = sub.application_docs || [];

  for (var i = 0; i < docs.length; i++) {  
    if (  
      docs[i].type &&  
      docs[i].type.toLowerCase() === "letter" &&  
      docs[i].url  
    ) {  
      return docs[i].url;  
    }  
  }

  return "";  
}

function shouldIncludeForFDAReport(sub) {  
  var code = cleanText(sub.submission_class_code);  
  var desc = cleanText(sub.submission_class_code_description);  
  var combined = (code + " " + desc).toUpperCase().trim();

  // If blank/null/empty, include it  
  if (!combined) return true;

  // Block list - these are minor administrative changes  
  var blocked = [  
    "LABELING",  
    "REMS",  
    "MANUF",  
    "CMC",  
    "PATENT",  
    "EXCLUSIVITY",  
    "ANNUAL REPORT",  
    "STABILITY",  
    "PROCESS",  
    "SUPPLIER",  
    "CONTAINER",  
    "SPECIFICATION",  
    "EXPIRATION",  
    "IMPURITY",  
    "METHOD",  
    "DISSOLUTION",  
    "EDITORIAL",  
    "CBE",  
    "PACKAGING"  
  ];

  for (var i = 0; i < blocked.length; i++) {  
    if (combined.indexOf(blocked[i]) !== -1) {  
      return false;  
    }  
  }

  // Everything else gets included  
  return true;  
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

function formatDateMMDDYYYY(fdaDate) {  
  if (!fdaDate || fdaDate.length !== 8) return "N/A";

  return (  
    fdaDate.substring(4, 6) +  
    "/" +  
    fdaDate.substring(6, 8) +  
    "/" +  
    fdaDate.substring(0, 4)  
  );  
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

function cleanRouteValue(route) {  
  if (Array.isArray(route)) {  
    return route.join(" ");  
  }

  return cleanText(route);  
}

function simplifyRoute(route, dosageForm) {  
  var r = cleanRouteValue(route).toUpperCase();  
  var d = cleanText(dosageForm).toUpperCase();

  if (r.indexOf("INTRAVENOUS") !== -1) return "IV";  
  if (r === "IV") return "IV";

  if (r.indexOf("SUBCUTANEOUS") !== -1) return "SUBQ";  
  if (r.indexOf("SUB-Q") !== -1) return "SUBQ";  
  if (r.indexOf("SUBQ") !== -1) return "SUBQ";

  if (r.indexOf("ORAL") !== -1) return "Oral";  
  if (r.indexOf("BY MOUTH") !== -1) return "Oral";

  if (r.indexOf("OPHTHALMIC") !== -1) return "Ophthalmic";  
  if (r.indexOf("INTRAOCULAR") !== -1) return "Ophthalmic";

  if (r.indexOf("INJECTION") !== -1) return "Injectable Other";  
  if (d.indexOf("INJECTION") !== -1) return "Injectable Other";  
  if (d.indexOf("INJECTABLE") !== -1) return "Injectable Other";

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

  if (text.length > 550) {  
    text = text.substring(0, 550) + "...";  
  }

  return text;  
}

function fetchIndicationForApproval(approval) {  
  var appNumber = cleanText(approval.application_number);  
  var brand = cleanText(approval.brand_name);  
  var generic = cleanText(approval.generic_name);

  var searches = [];

  if (appNumber) {  
    searches.push('openfda.application_number:"' + appNumber + '"');  
  }

  if (brand) {  
    searches.push('openfda.brand_name:"' + brand + '"');  
  }

  if (generic) {  
    searches.push('openfda.generic_name:"' + generic + '"');  
  }

  function trySearch(index) {  
    if (index >= searches.length) {  
      return Promise.resolve("N/A");  
    }

    var url =  
      "https://api.fda.gov/drug/label.json?search=" +  
      encodeURIComponent(searches[index]) +  
      "&limit=1";

    return fetch(url)  
      .then(function (response) {  
        if (!response.ok) {  
          return trySearch(index + 1);  
        }

        return response.json().then(function (data) {  
          var results = data.results || [];

          if (results.length === 0) {  
            return trySearch(index + 1);  
          }

          var label = results[0];

          var ind = label.indications_and_usage || [];

          if (ind.length > 0 && ind[0]) {  
            return cleanIndication(ind[0]);  
          }

          var purpose = label.purpose || [];

          if (purpose.length > 0 && purpose[0]) {  
            return cleanIndication(purpose[0]);  
          }

          return trySearch(index + 1);  
        });  
      })  
      .catch(function () {  
        return trySearch(index + 1);  
      });  
  }

  return trySearch(0);  
}

function mapIndicationToSpecialty(indication, drugName, genericName) {  
  var text = (  
    cleanText(indication) +  
    " " +  
    cleanText(drugName) +  
    " " +  
    cleanText(genericName)  
  ).toLowerCase();

  var rules = [  
    {  
      keywords: [  
        "plaque psoriasis",  
        "psoriasis",  
        "acne",  
        "dermatitis",  
        "eczema",  
        "hidradenitis",  
        "dermatology"  
      ],  
      specialty: "Dermatology"  
    },  
    {  
      keywords: [  
        "hemophilia",  
        "haemophilia",  
        "bleeding episode",  
        "factor viii",  
        "factor ix",  
        "hematology",  
        "anaemia",  
        "anemia"  
      ],  
      specialty: "Hematology"  
    },  
    {  
      keywords: [  
        "cancer",  
        "tumor",  
        "tumour",  
        "carcinoma",  
        "lymphoma",  
        "leukemia",  
        "leukaemia",  
        "melanoma",  
        "metastatic",  
        "breast cancer",  
        "renal cell carcinoma",  
        "tnbc",  
        "adjuvant treatment",  
        "oncology",  
        "chemotherapy",  
        "antiemetic",  
        "nausea and vomiting associated"  
      ],  
      specialty: "Oncology"  
    },  
    {  
      keywords: [  
        "neuromyelitis",  
        "nmosd",  
        "seizure",  
        "epilepsy",  
        "spasticity",  
        "cerebral palsy",  
        "neurology",  
        "migraine"  
      ],  
      specialty: "Neurology"  
    },  
    {  
      keywords: [  
        "thyroid eye disease",  
        "retinal",  
        "retina",  
        "ophthalmic",  
        "ophthalmology",  
        "macular",  
        "eye"  
      ],  
      specialty: "Ophthalmology"  
    },  
    {  
      keywords: [  
        "contrast",  
        "imaging",  
        "radiology",  
        "vascularity",  
        "computed tomography",  
        "magnetic resonance"  
      ],  
      specialty: "Radiology"  
    },  
    {  
      keywords: [  
        "urinary",  
        "bladder",  
        "urology",  
        "kidney stone",  
        "prostate",  
        "urinary tract"  
      ],  
      specialty: "Urology"  
    },  
    {  
      keywords: [  
        "diabetes",  
        "glucagon",  
        "thyroid",  
        "osteoporosis",  
        "hyperthyroidism",  
        "endocrine",  
        "metabolic",  
        "hypoglycemia"  
      ],  
      specialty: "Endocrinology / Metabolic"  
    },  
    {  
      keywords: [  
        "arthritis",  
        "rheumatoid",  
        "lupus",  
        "ankylosing",  
        "rheumatology",  
        "baricitinib"  
      ],  
      specialty: "Rheumatology"  
    },  
    {  
      keywords: [  
        "hypertension",  
        "heart failure",  
        "cardiac",  
        "cardiovascular",  
        "angina",  
        "arrhythmia",  
        "atrial fibrillation",  
        "blood pressure"  
      ],  
      specialty: "Cardiology"  
    },  
    {  
      keywords: [  
        "asthma",  
        "copd",  
        "pulmonary",  
        "respiratory",  
        "eosinophilic"  
      ],  
      specialty: "Pulmonology"  
    },  
    {  
      keywords: [  
        "infection",  
        "antibacterial",  
        "antiviral",  
        "antibiotic",  
        "microorganism",  
        "infectious",  
        "susceptible"  
      ],  
      specialty: "Infectious Disease"  
    },  
    {  
      keywords: [  
        "opioid",  
        "naloxone",  
        "overdose",  
        "pain",  
        "analgesic",  
        "emergency"  
      ],  
      specialty: "Emergency Medicine"  
    },  
    {  
      keywords: [  
        "contracepti",  
        "pregnancy",  
        "estradiol",  
        "vaginal",  
        "obstetric",  
        "gynecologic"  
      ],  
      specialty: "OB/GYN"  
    },  
    {  
      keywords: [  
        "renal",  
        "kidney",  
        "nephrology"  
      ],  
      specialty: "Nephrology"  
    },  
    {  
      keywords: [  
        "liver",  
        "hepatic",  
        "gastrointestinal",  
        "ulcerative colitis",  
        "crohn"  
      ],  
      specialty: "Gastroenterology"  
    },  
    {  
      keywords: [  
        "schizophrenia",  
        "bipolar",  
        "antipsychotic",  
        "depression",  
        "psychiatry"  
      ],  
      specialty: "Psychiatry"  
    }  
  ];

  for (var i = 0; i < rules.length; i++) {  
    for (var j = 0; j < rules[i].keywords.length; j++) {  
      if (text.indexOf(rules[i].keywords[j]) !== -1) {  
        return rules[i].specialty;  
      }  
    }  
  }

  return "General / Review Needed";  
}

function fetchAllDrugsFdaRecords(searchQuery) {  
  var all = [];  
  var limit = 100;  
  var skip = 0;

  function fetchPage() {  
    var url =  
      "https://api.fda.gov/drug/drugsfda.json?search=" +  
      encodeURIComponent(searchQuery) +  
      "&limit=" +  
      limit +  
      "&skip=" +  
      skip;

    return fetch(url)  
      .then(function (response) {  
        if (response.status === 404) {  
          return all;  
        }

        if (!response.ok) {  
          throw new Error("FDA API error: " + response.status);  
        }

        return response.json();  
      })  
      .then(function (data) {  
        if (!data || !data.results) {  
          return all;  
        }

        all = all.concat(data.results);

        if (data.results.length < limit) {  
          return all;  
        }

        skip += limit;  
        return fetchPage();  
      });  
  }

  return fetchPage();  
}

function updateMasterSpreadsheet() {  
  try {  
    setStatus("loading", "Building master report for the past 2 years...");

    var today = new Date();  
    var twoYearsAgo = new Date();

    twoYearsAgo.setFullYear(today.getFullYear() - 2);

    var fromDate = formatDateInput(twoYearsAgo);  
    var toDate = formatDateInput(today);

    document.getElementById("dateFrom").value = fromDate;  
    document.getElementById("dateTo").value = toDate;

    fetchAndDownload();  
  } catch (err) {  
    setStatus("error", err.message);  
  }  
}

function fetchAndDownload() {  
  var btn = document.getElementById("downloadBtn");  
  var masterBtn = document.getElementById("updateMasterBtn");

  btn.disabled = true;

  if (masterBtn) {  
    masterBtn.disabled = true;  
  }

  var fromDate = document.getElementById("dateFrom").value;  
  var toDate = document.getElementById("dateTo").value;

  if (!fromDate || !toDate) {  
    setStatus("error", "Please select both dates.");  
    btn.disabled = false;

    if (masterBtn) {  
      masterBtn.disabled = false;  
    }

    return;  
  }

  var fdaFrom = formatDateFDA(fromDate);  
  var fdaTo = formatDateFDA(toDate);

  setStatus("loading", "Fetching Drugs@FDA approvals...");

  var searchQuery =  
    "submissions.submission_status_date:[" +  
    fdaFrom +  
    " TO " +  
    fdaTo +  
    "]";

  fetchAllDrugsFdaRecords(searchQuery)  
    .then(function (results) {  
      if (!results || results.length === 0) {  
        setStatus("error", "No drug records found for this date range.");  
        btn.disabled = false;

        if (masterBtn) {  
          masterBtn.disabled = false;  
        }

        return;  
      }

      setStatus(  
        "loading",  
        "Processing " + results.length + " Drugs@FDA record(s)..."  
      );

      var approvals = [];  
      var seen = {};

      for (var i = 0; i < results.length; i++) {  
        var drug = results[i];  
        var submissions = drug.submissions || [];  
        var products = drug.products || [];  
        var openfda = drug.openfda || {};  
        var appNum = drug.application_number || "Unknown";

        if (appNum.toUpperCase().indexOf("ANDA") === 0) {  
          continue;  
        }

        for (var j = 0; j < submissions.length; j++) {  
          var sub = submissions[j];

          var subDate = cleanText(sub.submission_status_date);  
          var subStatus = cleanText(sub.submission_status).toUpperCase();

          if (!subDate || subStatus !== "AP") {  
            continue;  
          }

          var subInt = parseInt(subDate, 10);  
          var fromInt = parseInt(fdaFrom, 10);  
          var toInt = parseInt(fdaTo, 10);

          if (subInt < fromInt || subInt > toInt) {  
            continue;  
          }

          if (!shouldIncludeForFDAReport(sub)) {  
            continue;  
          }

          var classification = getSubmissionClassification(sub);

          var key =  
            appNum +  
            "_" +  
            subDate +  
            "_" +  
            cleanText(sub.submission_number) +  
            "_" +  
            classification;

          if (seen[key]) {  
            continue;  
          }

          seen[key] = true;

          var product = products.length > 0 ? products[0] : {};

          var brandName =  
            product.brand_name ||  
            getFirst(openfda.brand_name) ||  
            "Unknown";

          var genericName =  
            getFirst(openfda.generic_name) ||  
            getFirst(openfda.substance_name) ||  
            "Unknown";

          if (  
            genericName === "Unknown" &&  
            product.active_ingredients &&  
            product.active_ingredients.length > 0  
          ) {  
            genericName = product.active_ingredients[0].name || "Unknown";  
          }

          var dosageForm =  
            product.dosage_form ||  
            getFirst(openfda.dosage_form) ||  
            "Unknown";

          var rawRoute =  
            product.route ||  
            getFirst(openfda.route) ||  
            "Unknown";

          var route = simplifyRoute(rawRoute, dosageForm);

          approvals.push({  
            manufacturer: normalizeManufacturer(drug.sponsor_name || "Unknown"),  
            drug_name: buildDrugDisplayName(brandName, genericName),  
            brand_name: brandName,  
            generic_name: genericName,  
            submission_type: deriveSubmissionType(appNum, sub.submission_type),  
            therapeutic_specialty_category: "",  
            indication: "",  
            route_of_admin: route,  
            pdufa_date: formatDateMMDDYYYY(subDate),  
            pdufa_quarter: getPdufaQuarter(subDate),  
            pdufa_year: getPdufaYear(subDate),  
            submission_classification: classification,  
            application_number: appNum,  
            approval_date_raw: subDate,  
            sponsor: drug.sponsor_name || "Unknown",  
            dosage_form: dosageForm,  
            approval_letter_url: getApprovalLetterUrl(sub)  
          });  
        }  
      }

      if (approvals.length === 0) {  
        setStatus(  
          "error",  
          "No qualifying FDA approvals found. The range may not contain Efficacy, Type, or blank/null classifications."  
        );

        btn.disabled = false;

        if (masterBtn) {  
          masterBtn.disabled = false;  
        }

        return;  
      }

      setStatus(  
        "loading",  
        "Fetching Product Labeling indications for " + approvals.length + " approval(s)..."  
      );

      var indicationPromises = approvals.map(function (approval) {  
        return fetchIndicationForApproval(approval);  
      });

      Promise.all(indicationPromises)  
        .then(function (indResults) {  
          for (var b = 0; b < approvals.length; b++) {  
            var ind = indResults[b] || "N/A";

            approvals[b].indication = ind;

            approvals[b].therapeutic_specialty_category =  
              mapIndicationToSpecialty(  
                ind,  
                approvals[b].drug_name,  
                approvals[b].generic_name  
              );  
          }

          approvals.sort(function (a, b) {  
            if (a.approval_date_raw !== b.approval_date_raw) {  
              return a.approval_date_raw.localeCompare(b.approval_date_raw);  
            }

            return a.drug_name.localeCompare(b.drug_name);  
          });

          setStatus("loading", "Generating FDA Excel report...");

          generateFDAExcel(approvals, fromDate, toDate);

          setStatus(  
            "success",  
            "Downloaded " + approvals.length + " FDA approval(s)."  
          );

          btn.disabled = false;

          if (masterBtn) {  
            masterBtn.disabled = false;  
          }  
        })  
        .catch(function (err) {  
          setStatus("error", "Indication lookup error: " + err.message);

          btn.disabled = false;

          if (masterBtn) {  
            masterBtn.disabled = false;  
          }  
        });  
    })  
    .catch(function (err) {  
      setStatus("error", "Error: " + err.message);

      btn.disabled = false;

      if (masterBtn) {  
        masterBtn.disabled = false;  
      }  
    });  
}

function generateFDAExcel(approvals, fromDate, toDate) {  
  var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';  
  xml += '<?mso-application progid="Excel.Sheet"?>\n';  
  xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n';  
  xml += ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"\n';  
  xml += ' xmlns:x="urn:schemas-microsoft-com:office:excel">\n';

  xml += '<Styles>\n';

  xml += '<Style ss:ID="header">\n';  
  xml += '<Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>\n';  
  xml += '<Interior ss:Color="#156082" ss:Pattern="Solid"/>\n';  
  xml += '<Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>\n';  
  xml += '<Borders>\n';  
  xml += '<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '<Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '<Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '<Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '</Borders>\n';  
  xml += '</Style>\n';

  xml += '<Style ss:ID="dataBlue">\n';  
  xml += '<Font ss:FontName="Calibri" ss:Size="11"/>\n';  
  xml += '<Interior ss:Color="#C0E6F5" ss:Pattern="Solid"/>\n';  
  xml += '<Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>\n';  
  xml += '<Borders>\n';  
  xml += '<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '<Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '<Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '<Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '</Borders>\n';  
  xml += '</Style>\n';

  xml += '<Style ss:ID="dataWhite">\n';  
  xml += '<Font ss:FontName="Calibri" ss:Size="11"/>\n';  
  xml += '<Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>\n';  
  xml += '<Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>\n';  
  xml += '<Borders>\n';  
  xml += '<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '<Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '<Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '<Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '</Borders>\n';  
  xml += '</Style>\n';

  xml += '<Style ss:ID="indicationBlue">\n';  
  xml += '<Font ss:FontName="Calibri" ss:Size="11"/>\n';  
  xml += '<Interior ss:Color="#C0E6F5" ss:Pattern="Solid"/>\n';  
  xml += '<Alignment ss:Horizontal="Left" ss:Vertical="Top" ss:WrapText="1"/>\n';  
  xml += '<Borders>\n';  
  xml += '<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '<Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '<Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '<Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '</Borders>\n';  
  xml += '</Style>\n';

  xml += '<Style ss:ID="indicationWhite">\n';  
  xml += '<Font ss:FontName="Calibri" ss:Size="11"/>\n';  
  xml += '<Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>\n';  
  xml += '<Alignment ss:Horizontal="Left" ss:Vertical="Top" ss:WrapText="1"/>\n';  
  xml += '<Borders>\n';  
  xml += '<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '<Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '<Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '<Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '</Borders>\n';  
  xml += '</Style>\n';

  // Link styles for the Approval Letter column  
  xml += '<Style ss:ID="linkBlue">\n';  
  xml += '<Font ss:FontName="Calibri" ss:Size="11" ss:Color="#0563C1" ss:Underline="Single"/>\n';  
  xml += '<Interior ss:Color="#C0E6F5" ss:Pattern="Solid"/>\n';  
  xml += '<Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>\n';  
  xml += '<Borders>\n';  
  xml += '<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '<Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '<Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '<Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '</Borders>\n';  
  xml += '</Style>\n';

  xml += '<Style ss:ID="linkWhite">\n';  
  xml += '<Font ss:FontName="Calibri" ss:Size="11" ss:Color="#0563C1" ss:Underline="Single"/>\n';  
  xml += '<Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>\n';  
  xml += '<Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>\n';  
  xml += '<Borders>\n';  
  xml += '<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '<Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '<Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '<Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>\n';  
  xml += '</Borders>\n';  
  xml += '</Style>\n';

  xml += '</Styles>\n';

  xml += '<Worksheet ss:Name="FDA Approvals">\n';  
  xml += '<Table ss:DefaultRowHeight="18">\n';

  xml += '<Column ss:Width="150"/>\n';  
  xml += '<Column ss:Width="180"/>\n';  
  xml += '<Column ss:Width="120"/>\n';  
  xml += '<Column ss:Width="170"/>\n';  
  xml += '<Column ss:Width="420"/>\n';  
  xml += '<Column ss:Width="145"/>\n';  
  xml += '<Column ss:Width="125"/>\n';  
  xml += '<Column ss:Width="125"/>\n';  
  xml += '<Column ss:Width="125"/>\n';  
  xml += '<Column ss:Width="260"/>\n';  
  xml += '<Column ss:Width="200"/>\n';

  var headers = [  
    "Manufacturer",  
    "Drug name",  
    "Submission Type",  
    "Therapeutic Specialty Category",  
    "Indication",  
    "Route of Admin",  
    "PDUFA Date",  
    "PDUFA Quarter",  
    "PDUFA Year",  
    "Submission Classification",  
    "Approval Letter"  
  ];

  xml += '<Row ss:Height="22">\n';

  for (var h = 0; h < headers.length; h++) {  
    xml += '<Cell ss:StyleID="header"><Data ss:Type="String">' +  
      escapeXml(headers[h]) +  
      '</Data></Cell>\n';  
  }

  xml += '</Row>\n';

  for (var i = 0; i < approvals.length; i++) {  
    var a = approvals[i];

    var normalStyle = i % 2 === 0 ? "dataBlue" : "dataWhite";  
    var indicationStyle = i % 2 === 0 ? "indicationBlue" : "indicationWhite";  
    var linkStyle = i % 2 === 0 ? "linkBlue" : "linkWhite";

    var row = [  
      a.manufacturer,  
      a.drug_name,  
      a.submission_type,  
      a.therapeutic_specialty_category,  
      a.indication,  
      a.route_of_admin,  
      a.pdufa_date,  
      a.pdufa_quarter,  
      a.pdufa_year,  
      a.submission_classification  
    ];

    var letterUrl = a.approval_letter_url || "";

    xml += '<Row ss:AutoFitHeight="1">\n';

    for (var c = 0; c < row.length; c++) {  
      var styleToUse = c === 4 ? indicationStyle : normalStyle;

      xml += '<Cell ss:StyleID="' + styleToUse + '"><Data ss:Type="String">' +  
        escapeXml(row[c]) +  
        '</Data></Cell>\n';  
    }

    // Approval Letter column - clickable hyperlink  
    if (letterUrl) {  
      xml += '<Cell ss:StyleID="' + linkStyle + '" ss:HRef="' + escapeXml(letterUrl) + '"><Data ss:Type="String">View Letter</Data></Cell>\n';  
    } else {  
      xml += '<Cell ss:StyleID="' + normalStyle + '"><Data ss:Type="String">N/A</Data></Cell>\n';  
    }

    xml += '</Row>\n';  
  }

  xml += '</Table>\n';

  xml += '<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">\n';  
  xml += '<FreezePanes/>\n';  
  xml += '<FrozenNoSplit/>\n';  
  xml += '<SplitHorizontal>1</SplitHorizontal>\n';  
  xml += '<TopRowBottomPane>1</TopRowBottomPane>\n';  
  xml += '<ActivePane>2</ActivePane>\n';  
  xml += '</WorksheetOptions>\n';

  xml += '</Worksheet>\n';

  xml += '<Worksheet ss:Name="Validation Notes">\n';  
  xml += '<Table ss:DefaultRowHeight="20">\n';  
  xml += '<Column ss:Width="220"/>\n';  
  xml += '<Column ss:Width="520"/>\n';

  xml += '<Row>\n';  
  xml += '<Cell ss:StyleID="header"><Data ss:Type="String">Field</Data></Cell>\n';  
  xml += '<Cell ss:StyleID="header"><Data ss:Type="String">Value</Data></Cell>\n';  
  xml += '</Row>\n';

  var notes = [  
    ["Report Type", "FDA Drug Approval Report"],  
    ["Date Range", formatDateDisplay(fromDate) + " to " + formatDateDisplay(toDate)],  
    ["Total Included Rows", String(approvals.length)],  
    ["Primary Source", "openFDA Drugs@FDA endpoint"],  
    ["Supplemental Source", "openFDA Product Labeling endpoint for indication text"],  
    ["Inclusion Logic", "All approved submissions EXCEPT known administrative types"],  
    ["Excluded Classifications", "LABELING, REMS, MANUF/CMC, PATENT, EXCLUSIVITY, PACKAGING, EDITORIAL, CBE, STABILITY, ANNUAL REPORT"],  
    ["Excluded Application Type", "ANDA records are excluded by default"],  
    ["Note", "The FDA API has a 2-5 day indexing delay. For complete results, run 5-7 days after the target period ends."]  
  ];

  for (var n = 0; n < notes.length; n++) {  
    xml += '<Row>\n';  
    xml += '<Cell ss:StyleID="dataBlue"><Data ss:Type="String">' +  
      escapeXml(notes[n][0]) +  
      '</Data></Cell>\n';  
    xml += '<Cell ss:StyleID="dataWhite"><Data ss:Type="String">' +  
      escapeXml(notes[n][1]) +  
      '</Data></Cell>\n';  
    xml += '</Row>\n';  
  }

  xml += '</Table>\n';  
  xml += '</Worksheet>\n';

  xml += '</Workbook>';

  var blob = new Blob([xml], {  
    type: "application/vnd.ms-excel"  
  });

  var url = URL.createObjectURL(blob);  
  var link = document.createElement("a");

  link.href = url;  
  link.download =  
    "FDA_Drug_Approval_Report_" +  
    fromDate +  
    "_to_" +  
    toDate +  
    ".xls";

  document.body.appendChild(link);  
  link.click();  
  document.body.removeChild(link);

  URL.revokeObjectURL(url);  
}  

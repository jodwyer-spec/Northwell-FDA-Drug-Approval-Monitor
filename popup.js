document.addEventListener("DOMContentLoaded", function () {
  var today = new Date();
  var weekAgo = new Date();

  weekAgo.setDate(today.getDate() - 7);

  document.getElementById("dateTo").value = formatDateInput(today);
  document.getElementById("dateFrom").value = formatDateInput(weekAgo);

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

  if (type === "loading") {
    el.innerHTML = '<span class="spinner"></span>' + message;
  } else {
    el.innerHTML = message;
  }
}


function escapeXml(str) {
  if (str === null || str === undefined) return "";

  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}


function cleanValue(value, fallback) {
  if (value === null || value === undefined) return fallback || "N/A";

  var text = String(value).trim();

  if (!text) return fallback || "N/A";

  return text;
}


function firstArrayValue(value, fallback) {
  if (Array.isArray(value) && value.length > 0 && value[0]) {
    return cleanValue(value[0], fallback || "N/A");
  }

  return fallback || "N/A";
}


function getQuarterFromDate(rawDate) {
  if (!rawDate || rawDate.length < 6) return "N/A";

  var month = parseInt(rawDate.substring(4, 6), 10);

  if (month >= 1 && month <= 3) return "Q1";
  if (month >= 4 && month <= 6) return "Q2";
  if (month >= 7 && month <= 9) return "Q3";
  if (month >= 10 && month <= 12) return "Q4";

  return "N/A";
}


function getYearFromDate(rawDate) {
  if (!rawDate || rawDate.length < 4) return "N/A";

  return rawDate.substring(0, 4);
}


function normalizeRoute(routeText) {
  var text = String(routeText || "")
    .trim()
    .toUpperCase();

  if (!text) return "N/A";

  if (text.indexOf("SUBCUTANEOUS") !== -1 || text === "SC" || text === "SUBQ") {
    return "SUBQ";
  }

  if (text.indexOf("INTRAVENOUS") !== -1 || text === "IV") {
    return "IV";
  }

  if (text.indexOf("ORAL") !== -1 || text === "PO") {
    return "Oral";
  }

  if (
    text.indexOf("INJECTION") !== -1 ||
    text.indexOf("INJECTABLE") !== -1 ||
    text.indexOf("INTRAMUSCULAR") !== -1 ||
    text.indexOf("INTRAOCULAR") !== -1 ||
    text.indexOf("INTRAVITREAL") !== -1
  ) {
    return "Injectable Other";
  }

  return routeText || "N/A";
}


function getRawSubmissionClassText(sub) {
  var code = String(sub.submission_class_code || "").trim();
  var desc = String(sub.submission_class_code_description || "").trim();

  if (code && desc) {
    return code + " - " + desc;
  }

  if (desc) {
    return desc;
  }

  if (code) {
    return code;
  }

  return "";
}


function getApprovalType(sub) {
  var raw = getRawSubmissionClassText(sub);

  if (raw) {
    return raw;
  }

  return "N/A";
}


function getMaddieSubmissionClassification(sub, appNum) {
  var raw = getRawSubmissionClassText(sub);
  var text = raw.toUpperCase();

  if (text.indexOf("EFFICACY") !== -1) {
    return "Efficacy-New Indication";
  }

  if (text.indexOf("TYPE 1") !== -1) {
    return "Type 1 - New Molecular Entity";
  }

  if (text.indexOf("TYPE 2") !== -1) {
    return "Type 2 - New Active Ingredient";
  }

  if (text.indexOf("TYPE 3") !== -1) {
    return "Type 3 - New Dosage Form";
  }

  if (text.indexOf("TYPE 4") !== -1) {
    return "Type 4 - New Combination";
  }

  if (text.indexOf("TYPE 5") !== -1) {
    return "Type 5 - New Formulation or New Manufacturer";
  }

  if (text.indexOf("TYPE 6") !== -1) {
    return "Type 6 - New Indication";
  }

  if (text.indexOf("TYPE 7") !== -1) {
    return "Type 7 - Previously Marketed without Approved NDA";
  }

  // Maddie's manual sheet uses -- for many biologic / BLA / sBLA rows.
  if (String(appNum || "").toUpperCase().indexOf("BLA") === 0) {
    return "--";
  }

  if (!raw) {
    return "--";
  }

  return raw;
}


function shouldIncludeMaddieRow(sub, appNum) {
  var raw = getRawSubmissionClassText(sub).toUpperCase();
  var app = String(appNum || "").toUpperCase();
  var subType = String(sub.submission_type || "").toUpperCase();

  // Keep clinically meaningful classification types.
  if (raw.indexOf("EFFICACY") !== -1) {
    return true;
  }

  if (raw.indexOf("TYPE") !== -1) {
    return true;
  }

  // Keep BLA and sBLA style rows because Maddie has many -- classification rows for biologics.
  if (app.indexOf("BLA") === 0) {
    return true;
  }

  // Keep original NDA approvals unless they are clearly administrative / maintenance only.
  if (app.indexOf("NDA") === 0 && subType === "ORIG") {
    if (raw.indexOf("LABEL") !== -1) return false;
    if (raw.indexOf("REMS") !== -1) return false;
    if (raw.indexOf("MANUF") !== -1) return false;
    if (raw.indexOf("CMC") !== -1) return false;

    return true;
  }

  // Keep supplements only if they are efficacy/type-based.
  return false;
}


function mapSubmissionType(appNum, subType) {
  var app = String(appNum || "").toUpperCase();
  var type = String(subType || "").toUpperCase();

  if (app.indexOf("BLA") === 0) {
    if (type === "ORIG") return "BLA";
    if (type === "SUPPL") return "sBLA";
    return "BLA";
  }

  if (app.indexOf("NDA") === 0) {
    if (type === "ORIG") return "NDA";
    if (type === "SUPPL") return "sNDA";
    return "NDA";
  }

  if (app.indexOf("ANDA") === 0) {
    if (type === "ORIG") return "ANDA";
    if (type === "SUPPL") return "sANDA";
    return "ANDA";
  }

  if (type === "ORIG") return "NDA";
  if (type === "SUPPL") return "sNDA";
  if (type === "ABBR") return "ANDA";

  return type || "N/A";
}


function mapIndicationToSpecialty(indication, drugName, pharmClassText) {
  var text = (
    String(indication || "") + " " +
    String(drugName || "") + " " +
    String(pharmClassText || "")
  ).toLowerCase();

  var mapping = {
    "plaque psoriasis": "Dermatology",
    "psoriasis": "Dermatology",
    "dermatitis": "Dermatology",
    "eczema": "Dermatology",
    "acne": "Dermatology",
    "risankizumab": "Dermatology",

    "hemophilia": "Hematology",
    "bleeding": "Hematology",
    "factor viii": "Hematology",
    "factor ix": "Hematology",
    "marstacimab": "Hematology",

    "cancer": "Oncology",
    "tumor": "Oncology",
    "carcinoma": "Oncology",
    "lymphoma": "Oncology",
    "leukemia": "Oncology",
    "melanoma": "Oncology",
    "metastatic": "Oncology",
    "neoplasm": "Oncology",
    "chemotherapy": "Oncology",
    "breast cancer": "Oncology",
    "tnbc": "Oncology",
    "pembrolizumab": "Oncology",
    "keytruda": "Oncology",
    "trodelvy": "Oncology",
    "trastuzumab": "Oncology",
    "palbociclib": "Oncology",
    "ibrance": "Oncology",
    "belzutifan": "Oncology",
    "capivasertib": "Oncology",

    "neuromyelitis": "Neurology",
    "seizure": "Neurology",
    "epilepsy": "Neurology",
    "spasticity": "Neurology",
    "cerebral palsy": "Neurology",
    "neurological": "Neurology",
    "eculizumab": "Neurology",
    "xeomin": "Neurology",

    "thyroid eye disease": "Ophthalmology",
    "macular": "Ophthalmology",
    "retinal": "Ophthalmology",
    "diabetic retinopathy": "Ophthalmology",
    "ranibizumab": "Ophthalmology",
    "ophthalmic": "Ophthalmology",

    "psoriatic arthritis": "Rheumatology",
    "arthritis": "Rheumatology",
    "rheumatoid": "Rheumatology",
    "lupus": "Rheumatology",

    "mri": "Radiology",
    "magnetic resonance": "Radiology",
    "contrast": "Radiology",
    "imaging": "Radiology",
    "gadoquatrane": "Radiology",

    "urinary tract": "Urology",
    "cystinuria": "Urology",
    "cystine stone": "Urology",
    "pyelonephritis": "Urology",
    "tiopronin": "Urology",
    "tebipenem": "Urology",

    "hypertriglyceridemia": "Endocrinology / Metabolic",
    "triglycerides": "Endocrinology / Metabolic",
    "hypoglycemia": "Endocrinology / Metabolic",
    "diabetes": "Endocrinology / Metabolic",
    "insulin": "Endocrinology / Metabolic",
    "thyroid": "Endocrinology / Metabolic",
    "teplizumab": "Endocrinology / Metabolic",
    "dasiglucagon": "Endocrinology / Metabolic",
    "olezarsen": "Endocrinology / Metabolic",

    "infection": "Infectious Disease",
    "antibacterial": "Infectious Disease",
    "antibiotic": "Infectious Disease",
    "antiviral": "Infectious Disease",

    "heart failure": "Cardiology",
    "hypertension": "Cardiology",
    "cardiac": "Cardiology",
    "cardiovascular": "Cardiology",

    "pregnancy": "OB/GYN",
    "contracepti": "OB/GYN",
    "estradiol": "OB/GYN"
  };

  for (var keyword in mapping) {
    if (text.indexOf(keyword) !== -1) {
      return mapping[keyword];
    }
  }

  return "General / Review Needed";
}


function fetchLabelProfile(appNumber) {
  var query =
    "openfda.application_number:\"" +
    appNumber +
    "\"";

  var url =
    "https://api.fda.gov/drug/label.json?search=" +
    encodeURIComponent(query) +
    "&limit=1";

  return fetch(url)
    .then(function (response) {
      if (!response.ok) {
        return {};
      }

      return response.json();
    })
    .then(function (data) {
      var results = data.results || [];

      if (results.length === 0) {
        return {};
      }

      var label = results[0];
      var openfda = label.openfda || {};

      var indication = "N/A";

      if (
        label.indications_and_usage &&
        label.indications_and_usage.length > 0
      ) {
        indication = label.indications_and_usage[0] || "N/A";
      } else if (
        label.purpose &&
        label.purpose.length > 0
      ) {
        indication = label.purpose[0] || "N/A";
      }

      if (indication.length > 900) {
        indication = indication.substring(0, 900) + "...";
      }

      var route = firstArrayValue(openfda.route, "");
      var manufacturer = firstArrayValue(openfda.manufacturer_name, "");
      var brandName = firstArrayValue(openfda.brand_name, "");
      var genericName = firstArrayValue(openfda.generic_name, "");

      var classParts = [];

      if (openfda.pharm_class_epc) {
        classParts = classParts.concat(openfda.pharm_class_epc);
      }

      if (openfda.pharm_class_moa) {
        classParts = classParts.concat(openfda.pharm_class_moa);
      }

      if (openfda.pharm_class_pe) {
        classParts = classParts.concat(openfda.pharm_class_pe);
      }

      if (openfda.pharm_class_cs) {
        classParts = classParts.concat(openfda.pharm_class_cs);
      }

      return {
        indication: cleanValue(indication, "N/A"),
        route: cleanValue(route, ""),
        manufacturer: cleanValue(manufacturer, ""),
        brand_name: cleanValue(brandName, ""),
        generic_name: cleanValue(genericName, ""),
        pharm_class_text: classParts.join("; ")
      };
    })
    .catch(function () {
      return {};
    });
}


function fetchNdcProfile(appNumber) {
  var query =
    "application_number:\"" +
    appNumber +
    "\"";

  var url =
    "https://api.fda.gov/drug/ndc.json?search=" +
    encodeURIComponent(query) +
    "&limit=1";

  return fetch(url)
    .then(function (response) {
      if (!response.ok) {
        return {};
      }

      return response.json();
    })
    .then(function (data) {
      var results = data.results || [];

      if (results.length === 0) {
        return {};
      }

      var ndc = results[0];

      var ingredients = "N/A";

      if (
        ndc.active_ingredients &&
        ndc.active_ingredients.length > 0
      ) {
        var parts = [];

        for (var i = 0; i < ndc.active_ingredients.length; i++) {
          var item = ndc.active_ingredients[i];
          var name = item.name || "Unknown";
          var strength = item.strength || "";

          if (strength) {
            parts.push(name + " (" + strength + ")");
          } else {
            parts.push(name);
          }
        }

        ingredients = parts.join("; ");
      }

      var route = "N/A";

      if (ndc.route && ndc.route.length > 0) {
        route = ndc.route.join(" / ");
      }

      return {
        manufacturer: cleanValue(ndc.labeler_name, ""),
        dosage_form: cleanValue(ndc.dosage_form, ""),
        route: cleanValue(route, ""),
        active_ingredients: cleanValue(ingredients, "")
      };
    })
    .catch(function () {
      return {};
    });
}


function getProductBasics(products) {
  var drugName = "Unknown";
  var dosageForm = "Unknown";
  var route = "Unknown";
  var ingredients = "N/A";

  if (products.length > 0) {
    drugName = products[0].brand_name || "Unknown";
    dosageForm = products[0].dosage_form || "Unknown";
    route = products[0].route || "Unknown";

    var ais = products[0].active_ingredients || [];

    if (ais.length > 0) {
      var parts = [];

      for (var k = 0; k < ais.length; k++) {
        var aiName = ais[k].name || "Unknown";
        var aiStr = ais[k].strength || "";

        if (aiStr) {
          parts.push(aiName + " (" + aiStr + ")");
        } else {
          parts.push(aiName);
        }
      }

      ingredients = parts.join("; ");
    }
  }

  return {
    drug_name: drugName,
    dosage_form: dosageForm,
    route: route,
    active_ingredients: ingredients
  };
}


async function updateMasterSpreadsheet() {
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

  var url =
    "https://api.fda.gov/drug/drugsfda.json?" +
    "search=submissions.submission_status_date:" +
    "[" + fdaFrom + "+TO+" + fdaTo + "]" +
    "&limit=100";

  fetch(url)
    .then(function (response) {
      if (response.status === 404) {
        setStatus("error", "No approvals found for this date range.");

        btn.disabled = false;

        if (masterBtn) {
          masterBtn.disabled = false;
        }

        return null;
      }

      if (!response.ok) {
        throw new Error("FDA API error: " + response.status);
      }

      return response.json();
    })
    .then(async function (data) {
      if (!data) return;

      var results = data.results || [];

      if (results.length === 0) {
        setStatus("error", "No drug records found.");

        btn.disabled = false;

        if (masterBtn) {
          masterBtn.disabled = false;
        }

        return;
      }

      setStatus(
        "loading",
        "Processing " + results.length + " FDA record(s)..."
      );

      var approvals = [];
      var seen = {};
      var labelProfiles = {};
      var ndcProfiles = {};

      for (var i = 0; i < results.length; i++) {
        var drug = results[i];
        var submissions = drug.submissions || [];
        var products = drug.products || [];
        var openfda = drug.openfda || {};
        var appNum = drug.application_number || "Unknown";
        var appUpper = appNum.toUpperCase();

        // Maddie does not want generics/ANDA rows.
        if (appUpper.indexOf("ANDA") === 0) continue;

        var productBasics = getProductBasics(products);

        for (var j = 0; j < submissions.length; j++) {
          var sub = submissions[j];

          var subDate = sub.submission_status_date || "";
          var subStatus = sub.submission_status || "";

          if (!subDate || subStatus !== "AP") continue;

          var subInt = parseInt(subDate, 10);

          if (
            subInt < parseInt(fdaFrom, 10) ||
            subInt > parseInt(fdaTo, 10)
          ) {
            continue;
          }

          if (!shouldIncludeMaddieRow(sub, appNum)) {
            continue;
          }

          var key =
            appNum +
            "_" +
            subDate +
            "_" +
            (sub.submission_number || j) +
            "_" +
            getRawSubmissionClassText(sub);

          if (seen[key]) continue;

          seen[key] = true;

          var genericName = "Unknown";
          var gNames = openfda.generic_name || [];

          if (gNames.length > 0) {
            genericName = gNames[0];
          }

          approvals.push({
            application_number: appNum,
            manufacturer: drug.sponsor_name || "Unknown",
            drug_name: productBasics.drug_name,
            generic_name: genericName,
            submission_type: mapSubmissionType(appNum, sub.submission_type),
            therapeutic_specialty_category: "",
            indication: "",
            route_of_admin: normalizeRoute(productBasics.route),
            approval_date: formatDateFromRaw(subDate),
            approval_date_raw: subDate,
            approval_quarter: getQuarterFromDate(subDate),
            approval_year: getYearFromDate(subDate),
            submission_classification: getMaddieSubmissionClassification(sub, appNum),
            approval_type: getApprovalType(sub),
            sponsor: drug.sponsor_name || "Unknown",
            dosage_form: productBasics.dosage_form,
            active_ingredients: productBasics.active_ingredients
          });
        }
      }

      if (approvals.length === 0) {
        setStatus(
          "error",
          "No Maddie-style approvals found in this date range after filters."
        );

        btn.disabled = false;

        if (masterBtn) {
          masterBtn.disabled = false;
        }

        return;
      }

      setStatus(
        "loading",
        "Enriching " + approvals.length + " approval row(s) with label and NDC data..."
      );

      var appLookup = {};

      for (var a = 0; a < approvals.length; a++) {
        appLookup[approvals[a].application_number] = true;
      }

      var appKeys = Object.keys(appLookup);

      await Promise.all(
        appKeys.map(async function (appNumber) {
          labelProfiles[appNumber] = await fetchLabelProfile(appNumber);
          ndcProfiles[appNumber] = await fetchNdcProfile(appNumber);
        })
      );

      for (var b = 0; b < approvals.length; b++) {
        var row = approvals[b];
        var label = labelProfiles[row.application_number] || {};
        var ndc = ndcProfiles[row.application_number] || {};

        if (label.manufacturer && label.manufacturer !== "N/A") {
          row.manufacturer = label.manufacturer;
        } else if (ndc.manufacturer && ndc.manufacturer !== "N/A") {
          row.manufacturer = ndc.manufacturer;
        }

        if (
          (!row.indication || row.indication === "N/A") &&
          label.indication
        ) {
          row.indication = label.indication;
        }

        if (
          (!row.route_of_admin || row.route_of_admin === "Unknown" || row.route_of_admin === "N/A") &&
          label.route
        ) {
          row.route_of_admin = normalizeRoute(label.route);
        }

        if (
          (!row.route_of_admin || row.route_of_admin === "Unknown" || row.route_of_admin === "N/A") &&
          ndc.route
        ) {
          row.route_of_admin = normalizeRoute(ndc.route);
        }

        if (
          (!row.dosage_form || row.dosage_form === "Unknown" || row.dosage_form === "N/A") &&
          ndc.dosage_form
        ) {
          row.dosage_form = ndc.dosage_form;
        }

        if (
          (!row.active_ingredients || row.active_ingredients === "N/A") &&
          ndc.active_ingredients
        ) {
          row.active_ingredients = ndc.active_ingredients;
        }

        row.therapeutic_specialty_category =
          mapIndicationToSpecialty(
            row.indication,
            row.drug_name,
            label.pharm_class_text
          );
      }

      approvals.sort(function (a, b) {
        if (a.approval_date_raw !== b.approval_date_raw) {
          return a.approval_date_raw.localeCompare(b.approval_date_raw);
        }

        return a.drug_name.localeCompare(b.drug_name);
      });

      setStatus("loading", "Generating Maddie-style Excel report...");

      generateFormattedExcel(approvals, fromDate, toDate);

      setStatus(
        "success",
        "Downloaded " + approvals.length + " Maddie-style approval row(s)."
      );

      btn.disabled = false;

      if (masterBtn) {
        masterBtn.disabled = false;
      }
    })
    .catch(function (err) {
      setStatus("error", "Error: " + err.message);

      btn.disabled = false;

      if (masterBtn) {
        masterBtn.disabled = false;
      }
    });
}


function formatDateFromRaw(rawDate) {
  if (!rawDate || rawDate.length !== 8) return rawDate || "N/A";

  return (
    rawDate.substring(4, 6) +
    "/" +
    rawDate.substring(6, 8) +
    "/" +
    rawDate.substring(0, 4)
  );
}


function generateFormattedExcel(approvals, fromDate, toDate) {
  var specialtyCounts = {};
  var submissionTypeCounts = {};
  var classificationCounts = {};

  for (var i = 0; i < approvals.length; i++) {
    var row = approvals[i];

    specialtyCounts[row.therapeutic_specialty_category] =
      (specialtyCounts[row.therapeutic_specialty_category] || 0) + 1;

    submissionTypeCounts[row.submission_type] =
      (submissionTypeCounts[row.submission_type] || 0) + 1;

    classificationCounts[row.submission_classification] =
      (classificationCounts[row.submission_classification] || 0) + 1;
  }

  var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<?mso-application progid="Excel.Sheet"?>\n';
  xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n';
  xml += ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"\n';
  xml += ' xmlns:x="urn:schemas-microsoft-com:office:excel">\n';

  xml += '<Styles>\n';

  xml += '<Style ss:ID="Default" ss:Name="Normal">\n';
  xml += '  <Font ss:FontName="Calibri" ss:Size="11"/>\n';
  xml += '  <Alignment ss:Vertical="Center" ss:WrapText="1"/>\n';
  xml += '</Style>\n';

  xml += '<Style ss:ID="title">\n';
  xml += '  <Font ss:FontName="Calibri" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/>\n';
  xml += '  <Interior ss:Color="#0078D4" ss:Pattern="Solid"/>\n';
  xml += '</Style>\n';

  xml += '<Style ss:ID="header">\n';
  xml += '  <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>\n';
  xml += '  <Interior ss:Color="#0078D4" ss:Pattern="Solid"/>\n';
  xml += '  <Alignment ss:Vertical="Center" ss:WrapText="1"/>\n';
  xml += '  <Borders>\n';
  xml += '    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#005A9E"/>\n';
  xml += '    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#005A9E"/>\n';
  xml += '    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#005A9E"/>\n';
  xml += '  </Borders>\n';
  xml += '</Style>\n';

  xml += '<Style ss:ID="section">\n';
  xml += '  <Font ss:FontName="Calibri" ss:Size="13" ss:Bold="1" ss:Color="#0078D4"/>\n';
  xml += '</Style>\n';

  xml += '<Style ss:ID="data">\n';
  xml += '  <Font ss:FontName="Calibri" ss:Size="11"/>\n';
  xml += '  <Alignment ss:Vertical="Center" ss:WrapText="1"/>\n';
  xml += '  <Borders>\n';
  xml += '    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E0E0E0"/>\n';
  xml += '    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E0E0E0"/>\n';
  xml += '    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E0E0E0"/>\n';
  xml += '  </Borders>\n';
  xml += '</Style>\n';

  xml += '<Style ss:ID="dataAlt">\n';
  xml += '  <Font ss:FontName="Calibri" ss:Size="11"/>\n';
  xml += '  <Interior ss:Color="#F2F7FC" ss:Pattern="Solid"/>\n';
  xml += '  <Alignment ss:Vertical="Center" ss:WrapText="1"/>\n';
  xml += '  <Borders>\n';
  xml += '    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E0E0E0"/>\n';
  xml += '    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E0E0E0"/>\n';
  xml += '    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E0E0E0"/>\n';
  xml += '  </Borders>\n';
  xml += '</Style>\n';

  xml += '<Style ss:ID="countNum">\n';
  xml += '  <Font ss:FontName="Calibri" ss:Size="11"/>\n';
  xml += '  <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>\n';
  xml += '</Style>\n';

  xml += '</Styles>\n';

  xml += '<Worksheet ss:Name="Summary">\n';
  xml += '<Table ss:DefaultRowHeight="22">\n';
  xml += '<Column ss:Width="260"/>\n';
  xml += '<Column ss:Width="90"/>\n';

  xml += '<Row ss:Height="35">\n';
  xml += '  <Cell ss:StyleID="title" ss:MergeAcross="1"><Data ss:Type="String">FDA Drug Approval Report</Data></Cell>\n';
  xml += '</Row>\n';

  xml += '<Row>\n';
  xml += '  <Cell ss:StyleID="data"><Data ss:Type="String">Date Range</Data></Cell>\n';
  xml += '  <Cell ss:StyleID="data"><Data ss:Type="String">' +
    escapeXml(formatDateDisplay(fromDate)) +
    " to " +
    escapeXml(formatDateDisplay(toDate)) +
    '</Data></Cell>\n';
  xml += '</Row>\n';

  xml += '<Row>\n';
  xml += '  <Cell ss:StyleID="data"><Data ss:Type="String">Total Rows</Data></Cell>\n';
  xml += '  <Cell ss:StyleID="countNum"><Data ss:Type="Number">' +
    approvals.length +
    '</Data></Cell>\n';
  xml += '</Row>\n';

  xml += '<Row><Cell><Data ss:Type="String"></Data></Cell></Row>\n';

  xml += '<Row>\n';
  xml += '  <Cell ss:StyleID="section" ss:MergeAcross="1"><Data ss:Type="String">Submission Classification Counts</Data></Cell>\n';
  xml += '</Row>\n';

  xml += '<Row>\n';
  xml += '  <Cell ss:StyleID="header"><Data ss:Type="String">Submission Classification</Data></Cell>\n';
  xml += '  <Cell ss:StyleID="header"><Data ss:Type="String">Count</Data></Cell>\n';
  xml += '</Row>\n';

  for (var cls in classificationCounts) {
    xml += '<Row>\n';
    xml += '  <Cell ss:StyleID="data"><Data ss:Type="String">' +
      escapeXml(cls) +
      '</Data></Cell>\n';
    xml += '  <Cell ss:StyleID="countNum"><Data ss:Type="Number">' +
      classificationCounts[cls] +
      '</Data></Cell>\n';
    xml += '</Row>\n';
  }

  xml += '<Row><Cell><Data ss:Type="String"></Data></Cell></Row>\n';

  xml += '<Row>\n';
  xml += '  <Cell ss:StyleID="section" ss:MergeAcross="1"><Data ss:Type="String">Specialty Counts</Data></Cell>\n';
  xml += '</Row>\n';

  xml += '<Row>\n';
  xml += '  <Cell ss:StyleID="header"><Data ss:Type="String">Therapeutic Specialty Category</Data></Cell>\n';
  xml += '  <Cell ss:StyleID="header"><Data ss:Type="String">Count</Data></Cell>\n';
  xml += '</Row>\n';

  for (var spec in specialtyCounts) {
    xml += '<Row>\n';
    xml += '  <Cell ss:StyleID="data"><Data ss:Type="String">' +
      escapeXml(spec) +
      '</Data></Cell>\n';
    xml += '  <Cell ss:StyleID="countNum"><Data ss:Type="Number">' +
      specialtyCounts[spec] +
      '</Data></Cell>\n';
    xml += '</Row>\n';
  }

  xml += '</Table>\n';
  xml += '</Worksheet>\n';

  xml += '<Worksheet ss:Name="All Approvals">\n';
  xml += '<Table ss:DefaultRowHeight="24">\n';

  var widths = [
    150, 220, 100, 190, 430, 120,
    220, 190, 170, 170, 130, 270
  ];

  for (var w = 0; w < widths.length; w++) {
    xml += '<Column ss:Width="' + widths[w] + '"/>\n';
  }

  xml += '<Row ss:Height="35">\n';
  xml += '  <Cell ss:StyleID="title" ss:MergeAcross="11"><Data ss:Type="String">Maddie-Style FDA Drug Approvals - ' +
    escapeXml(formatDateDisplay(fromDate)) +
    " to " +
    escapeXml(formatDateDisplay(toDate)) +
    '</Data></Cell>\n';
  xml += '</Row>\n';

  var headers = [
    "Manufacturer",
    "Drug Name",
    "Submission Type",
    "Therapeutic Specialty Category",
    "Indication",
    "Route of Admin",
    "Submission Classification",
    "Approval Type",
    "Sponsor",
    "Dosage Form",
    "Application #",
    "Active Ingredients"
  ];

  xml += '<Row ss:Height="32">\n';

  for (var h = 0; h < headers.length; h++) {
    xml += '  <Cell ss:StyleID="header"><Data ss:Type="String">' +
      escapeXml(headers[h]) +
      '</Data></Cell>\n';
  }

  xml += '</Row>\n';

  for (var d = 0; d < approvals.length; d++) {
    var app = approvals[d];
    var rowStyle = d % 2 === 1 ? "dataAlt" : "data";

    xml += '<Row>\n';

    xml += makeCell(app.manufacturer, rowStyle);
    xml += makeCell(app.drug_name, rowStyle);
    xml += makeCell(app.submission_type, rowStyle);
    xml += makeCell(app.therapeutic_specialty_category, rowStyle);
    xml += makeCell(app.indication, rowStyle);
    xml += makeCell(app.route_of_admin, rowStyle);
    xml += makeCell(app.submission_classification, rowStyle);
    xml += makeCell(app.approval_type, rowStyle);
    xml += makeCell(app.sponsor, rowStyle);
    xml += makeCell(app.dosage_form, rowStyle);
    xml += makeCell(app.application_number, rowStyle);
    xml += makeCell(app.active_ingredients, rowStyle);

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


function makeCell(value, styleId) {
  return (
    '  <Cell ss:StyleID="' +
    styleId +
    '"><Data ss:Type="String">' +
    escapeXml(value || "N/A") +
    '</Data></Cell>\n'
  );
}

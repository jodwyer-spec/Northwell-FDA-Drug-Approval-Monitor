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


function fetchIndication(appNumber) {
  var url =
    "https://api.fda.gov/drug/label.json?" +
    "search=openfda.application_number:\"" +
    appNumber +
    "\"&limit=1";

  return fetch(url)
    .then(function (response) {
      if (!response.ok) return "N/A";

      return response.json().then(function (data) {
        var results = data.results || [];

        if (results.length > 0) {
          var label = results[0];

          var ind = label.indications_and_usage || [];

          if (ind.length > 0 && ind[0]) {
            var text = ind[0];

            if (text.length > 500) {
              text = text.substring(0, 500) + "...";
            }

            return text;
          }

          var purp = label.purpose || [];

          if (purp.length > 0 && purp[0]) {
            return purp[0];
          }
        }

        return "N/A";
      });
    })
    .catch(function () {
      return "N/A";
    });
}


function getApprovalType(sub) {
  var code = sub.submission_class_code || "";
  var desc = sub.submission_class_code_description || "";

  code = String(code).trim();
  desc = String(desc).trim();

  if (code && desc) {
    return code + " - " + desc;
  }

  if (desc) {
    return desc;
  }

  if (code) {
    return code;
  }

  return "N/A";
}


function shouldSkipApprovalType(approvalType) {
  var text = String(approvalType || "")
    .trim()
    .toUpperCase();

  /*
    Keep only approval types that are clinically relevant based on the current business rule.

    Keep:
    - EFFICACY
    - TYPE
    - NULL
    - N/A
    - blank values

    Skip everything else:
    - Labeling
    - Manufacturing
    - CMC
    - Administrative
    - REMS
    - Other non-target approval actions
  */

  // Keep blank approval types
  if (text === "") {
    return false;
  }

  // Keep null-like approval types
  if (text === "NULL") {
    return false;
  }

  // Keep N/A approval types
  if (text === "N/A") {
    return false;
  }

  // Keep efficacy-related approval types
  if (text.indexOf("EFFICACY") !== -1) {
    return false;
  }

  // Keep type-based approval classifications
  // Examples: Type 1, Type 2, Type 3, Type 4, Type 5, Type 6
  if (text.indexOf("TYPE") !== -1) {
    return false;
  }

  // Skip everything else
  return true;
}


function mapIndicationToSpecialty(indication, drugName) {
  var text = (indication + " " + drugName).toLowerCase();

  var mapping = {
    "hypertension": "Cardiology",
    "heart failure": "Cardiology",
    "cardiac": "Cardiology",
    "cardiovascular": "Cardiology",
    "angina": "Cardiology",
    "arrhythmia": "Cardiology",
    "atrial fibrillation": "Cardiology",
    "blood pressure": "Cardiology",

    "cancer": "Oncology",
    "tumor": "Oncology",
    "carcinoma": "Oncology",
    "lymphoma": "Oncology",
    "leukemia": "Oncology",
    "melanoma": "Oncology / Dermatology",
    "metastatic": "Oncology",

    "seizure": "Neurology",
    "epilepsy": "Neurology",
    "neurological": "Neurology",
    "anticonvulsant": "Neurology",

    "schizophrenia": "Psychiatry",
    "bipolar": "Psychiatry",
    "antipsychotic": "Psychiatry",
    "depression": "Psychiatry",

    "acne": "Dermatology",
    "dermatitis": "Dermatology",
    "psoriasis": "Dermatology",
    "eczema": "Dermatology",

    "asthma": "Pulmonology",
    "copd": "Pulmonology",
    "pulmonary": "Pulmonology",
    "respiratory": "Pulmonology",

    "arthritis": "Rheumatology",
    "rheumatoid": "Rheumatology",
    "lupus": "Rheumatology",

    "glaucoma": "Ophthalmology",
    "ophthalmic": "Ophthalmology",
    "retinal": "Ophthalmology",

    "liver": "Gastroenterology",
    "hepatic": "Gastroenterology",
    "gastrointestinal": "Gastroenterology",

    "renal": "Nephrology",
    "kidney": "Nephrology",

    "diabetes": "Endocrinology",
    "thyroid": "Endocrinology",
    "osteoporosis": "Endocrinology",

    "infection": "Infectious Disease",
    "antibacterial": "Infectious Disease",
    "antiviral": "Infectious Disease",
    "antibiotic": "Infectious Disease",

    "naloxone": "Emergency Medicine",
    "opioid": "Emergency Medicine",

    "contrast": "Radiology",
    "imaging": "Radiology",

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


function escapeXml(str) {
  if (!str) return "";

  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}


function loadMasterData() {
  return new Promise(function (resolve) {
    chrome.storage.local.get(["masterApprovals"], function (result) {
      resolve(result.masterApprovals || []);
    });
  });
}


function saveMasterData(data) {
  return new Promise(function (resolve) {
    chrome.storage.local.set(
      {
        masterApprovals: data
      },
      function () {
        resolve();
      }
    );
  });
}


function createApprovalKey(approval) {
  return approval.application_number + "_" + approval.approval_date_raw;
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

  setStatus("loading", "Fetching FDA approvals...");

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
    .then(function (data) {
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
        "Processing " + results.length + " drug record(s)..."
      );

      var approvals = [];
      var seen = {};

      for (var i = 0; i < results.length; i++) {
        var drug = results[i];
        var submissions = drug.submissions || [];
        var products = drug.products || [];
        var openfda = drug.openfda || {};
        var appNum = drug.application_number || "Unknown";

        // Skip generic ANDA approvals.
        if (appNum.toUpperCase().indexOf("ANDA") === 0) continue;

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

          var approvalType = getApprovalType(sub);

          // Skip labeling/labelling-only approval actions.
          if (shouldSkipApprovalType(approvalType)) {
            continue;
          }

          var key = appNum + "_" + subDate + "_" + (sub.submission_number || j);

          if (seen[key]) continue;

          seen[key] = true;

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

          var genericName = "Unknown";
          var gNames = openfda.generic_name || [];

          if (gNames.length > 0) {
            genericName = gNames[0];
          }

          var subType = sub.submission_type || "Unknown";
          var subTypeDesc = subType;

          if (subType === "ORIG") {
            subTypeDesc = "New Drug Application";
          } else if (subType === "SUPPL") {
            subTypeDesc = "Supplemental";
          } else if (subType === "ABBR") {
            subTypeDesc = "Abbreviated (Generic)";
          }

          var dateDisplay = subDate;

          if (subDate.length === 8) {
            dateDisplay =
              subDate.substring(4, 6) +
              "/" +
              subDate.substring(6, 8) +
              "/" +
              subDate.substring(0, 4);
          }

          approvals.push({
            drug_name: drugName,
            generic_name: genericName,
            approval_date: dateDisplay,
            approval_date_raw: subDate,
            application_number: appNum,
            submission_type: subTypeDesc,
            approval_type: approvalType,
            sponsor: drug.sponsor_name || "Unknown",
            dosage_form: dosageForm,
            route: route,
            active_ingredients: ingredients,
            indication: "",
            specialty: ""
          });
        }
      }

      if (approvals.length === 0) {
        setStatus("error", "No approved drugs found in range after filters.");
        btn.disabled = false;

        if (masterBtn) {
          masterBtn.disabled = false;
        }

        return;
      }

      setStatus(
        "loading",
        "Fetching indications for " + approvals.length + " drug(s)..."
      );

      var fetchedApps = {};

      for (var a = 0; a < approvals.length; a++) {
        var thisApp = approvals[a].application_number;

        if (!fetchedApps[thisApp]) {
          fetchedApps[thisApp] = fetchIndication(thisApp);
        }
      }

      var appKeys = Object.keys(fetchedApps);

      Promise.all(
        appKeys.map(function (k) {
          return fetchedApps[k];
        })
      ).then(function (indResults) {
        var indMap = {};

        for (var x = 0; x < appKeys.length; x++) {
          indMap[appKeys[x]] = indResults[x];
        }

        for (var b = 0; b < approvals.length; b++) {
          var ind =
            indMap[approvals[b].application_number] || "N/A";

          approvals[b].indication = ind;

          approvals[b].specialty = mapIndicationToSpecialty(
            ind,
            approvals[b].drug_name
          );
        }

        approvals.sort(function (a, b) {
          if (a.approval_date_raw !== b.approval_date_raw) {
            return a.approval_date_raw.localeCompare(b.approval_date_raw);
          }

          return a.drug_name.localeCompare(b.drug_name);
        });

        setStatus("loading", "Generating formatted report...");

        generateFormattedExcel(approvals, fromDate, toDate);

        setStatus(
          "success",
          "Downloaded " + approvals.length + " drug approval(s)."
        );

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


function generateFormattedExcel(approvals, fromDate, toDate) {
  var typeCounts = {};
  var approvalTypeCounts = {};
  var specCounts = {};
  var sponsorCounts = {};

  for (var i = 0; i < approvals.length; i++) {
    var a = approvals[i];

    typeCounts[a.submission_type] =
      (typeCounts[a.submission_type] || 0) + 1;

    approvalTypeCounts[a.approval_type] =
      (approvalTypeCounts[a.approval_type] || 0) + 1;

    specCounts[a.specialty] =
      (specCounts[a.specialty] || 0) + 1;

    sponsorCounts[a.sponsor] =
      (sponsorCounts[a.sponsor] || 0) + 1;
  }

  var specKeys = Object.keys(specCounts).sort(function (a, b) {
    return specCounts[b] - specCounts[a];
  });

  var sponsorKeys = Object.keys(sponsorCounts).sort(function (a, b) {
    return sponsorCounts[b] - sponsorCounts[a];
  });

  var approvalTypeKeys = Object.keys(approvalTypeCounts).sort(function (a, b) {
    return approvalTypeCounts[b] - approvalTypeCounts[a];
  });

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
  xml += '  <Font ss:FontName="Calibri" ss:Size="18" ss:Bold="1" ss:Color="#FFFFFF"/>\n';
  xml += '  <Interior ss:Color="#0078D4" ss:Pattern="Solid"/>\n';
  xml += '  <Alignment ss:Vertical="Center"/>\n';
  xml += '</Style>\n';

  xml += '<Style ss:ID="subtitle">\n';
  xml += '  <Font ss:FontName="Calibri" ss:Size="12" ss:Color="#FFFFFF"/>\n';
  xml += '  <Interior ss:Color="#0078D4" ss:Pattern="Solid"/>\n';
  xml += '  <Alignment ss:Vertical="Center"/>\n';
  xml += '</Style>\n';

  xml += '<Style ss:ID="section">\n';
  xml += '  <Font ss:FontName="Calibri" ss:Size="13" ss:Bold="1" ss:Color="#0078D4"/>\n';
  xml += '  <Borders>\n';
  xml += '    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0078D4"/>\n';
  xml += '  </Borders>\n';
  xml += '  <Alignment ss:Vertical="Center"/>\n';
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

  xml += '<Style ss:ID="drugName">\n';
  xml += '  <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#333333"/>\n';
  xml += '  <Alignment ss:Vertical="Center"/>\n';
  xml += '  <Borders>\n';
  xml += '    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E0E0E0"/>\n';
  xml += '    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E0E0E0"/>\n';
  xml += '    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E0E0E0"/>\n';
  xml += '  </Borders>\n';
  xml += '</Style>\n';

  xml += '<Style ss:ID="drugNameAlt">\n';
  xml += '  <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#333333"/>\n';
  xml += '  <Interior ss:Color="#F2F7FC" ss:Pattern="Solid"/>\n';
  xml += '  <Alignment ss:Vertical="Center"/>\n';
  xml += '  <Borders>\n';
  xml += '    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E0E0E0"/>\n';
  xml += '    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E0E0E0"/>\n';
  xml += '    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E0E0E0"/>\n';
  xml += '  </Borders>\n';
  xml += '</Style>\n';

  xml += '<Style ss:ID="infoLabel">\n';
  xml += '  <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#555555"/>\n';
  xml += '  <Alignment ss:Vertical="Center"/>\n';
  xml += '</Style>\n';

  xml += '<Style ss:ID="infoValue">\n';
  xml += '  <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#333333"/>\n';
  xml += '  <Alignment ss:Vertical="Center"/>\n';
  xml += '</Style>\n';

  xml += '<Style ss:ID="countNum">\n';
  xml += '  <Font ss:FontName="Calibri" ss:Size="11"/>\n';
  xml += '  <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>\n';
  xml += '  <Borders>\n';
  xml += '    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E0E0E0"/>\n';
  xml += '  </Borders>\n';
  xml += '</Style>\n';

  xml += '<Style ss:ID="specGroup">\n';
  xml += '  <Font ss:FontName="Calibri" ss:Size="12" ss:Bold="1" ss:Color="#FFFFFF"/>\n';
  xml += '  <Interior ss:Color="#28A745" ss:Pattern="Solid"/>\n';
  xml += '  <Alignment ss:Vertical="Center"/>\n';
  xml += '</Style>\n';

  xml += '</Styles>\n';

  xml += '<Worksheet ss:Name="Summary">\n';
  xml += '<Table ss:DefaultRowHeight="20">\n';
  xml += '<Column ss:Width="220"/>\n';
  xml += '<Column ss:Width="320"/>\n';

  xml += '<Row ss:Height="40">\n';
  xml += '  <Cell ss:StyleID="title" ss:MergeAcross="1"><Data ss:Type="String">FDA Drug Approval Report</Data></Cell>\n';
  xml += '</Row>\n';

  xml += '<Row ss:Height="25">\n';
  xml += '  <Cell ss:StyleID="subtitle" ss:MergeAcross="1"><Data ss:Type="String">Northwell Health - Business Operations</Data></Cell>\n';
  xml += '</Row>\n';

  xml += '<Row><Cell><Data ss:Type="String"></Data></Cell></Row>\n';

  xml += '<Row>\n';
  xml += '  <Cell ss:StyleID="infoLabel"><Data ss:Type="String">Report Generated:</Data></Cell>\n';
  xml += '  <Cell ss:StyleID="infoValue"><Data ss:Type="String">' +
    escapeXml(new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    })) +
    '</Data></Cell>\n';
  xml += '</Row>\n';

  xml += '<Row>\n';
  xml += '  <Cell ss:StyleID="infoLabel"><Data ss:Type="String">Date Range:</Data></Cell>\n';
  xml += '  <Cell ss:StyleID="infoValue"><Data ss:Type="String">' +
    escapeXml(formatDateDisplay(fromDate)) +
    " to " +
    escapeXml(formatDateDisplay(toDate)) +
    '</Data></Cell>\n';
  xml += '</Row>\n';

  xml += '<Row>\n';
  xml += '  <Cell ss:StyleID="infoLabel"><Data ss:Type="String">Total Approvals:</Data></Cell>\n';
  xml += '  <Cell ss:StyleID="infoValue"><Data ss:Type="Number">' +
    approvals.length +
    '</Data></Cell>\n';
  xml += '</Row>\n';

  xml += '<Row><Cell><Data ss:Type="String"></Data></Cell></Row>\n';

  xml += '<Row>\n';
  xml += '  <Cell ss:StyleID="section" ss:MergeAcross="1"><Data ss:Type="String">Approvals by Submission Type</Data></Cell>\n';
  xml += '</Row>\n';

  xml += '<Row>\n';
  xml += '  <Cell ss:StyleID="header"><Data ss:Type="String">Submission Type</Data></Cell>\n';
  xml += '  <Cell ss:StyleID="header"><Data ss:Type="String">Count</Data></Cell>\n';
  xml += '</Row>\n';

  for (var t in typeCounts) {
    xml += '<Row>\n';
    xml += '  <Cell ss:StyleID="data"><Data ss:Type="String">' +
      escapeXml(t) +
      '</Data></Cell>\n';
    xml += '  <Cell ss:StyleID="countNum"><Data ss:Type="Number">' +
      typeCounts[t] +
      '</Data></Cell>\n';
    xml += '</Row>\n';
  }

  xml += '<Row><Cell><Data ss:Type="String"></Data></Cell></Row>\n';

  xml += '<Row>\n';
  xml += '  <Cell ss:StyleID="section" ss:MergeAcross="1"><Data ss:Type="String">Approvals by Approval Type</Data></Cell>\n';
  xml += '</Row>\n';

  xml += '<Row>\n';
  xml += '  <Cell ss:StyleID="header"><Data ss:Type="String">Approval Type</Data></Cell>\n';
  xml += '  <Cell ss:StyleID="header"><Data ss:Type="String">Count</Data></Cell>\n';
  xml += '</Row>\n';

  for (var atIndex = 0; atIndex < approvalTypeKeys.length; atIndex++) {
    var at = approvalTypeKeys[atIndex];

    xml += '<Row>\n';
    xml += '  <Cell ss:StyleID="data"><Data ss:Type="String">' +
      escapeXml(at) +
      '</Data></Cell>\n';
    xml += '  <Cell ss:StyleID="countNum"><Data ss:Type="Number">' +
      approvalTypeCounts[at] +
      '</Data></Cell>\n';
    xml += '</Row>\n';
  }

  xml += '<Row><Cell><Data ss:Type="String"></Data></Cell></Row>\n';

  xml += '<Row>\n';
  xml += '  <Cell ss:StyleID="section" ss:MergeAcross="1"><Data ss:Type="String">Approvals by Specialty</Data></Cell>\n';
  xml += '</Row>\n';

  xml += '<Row>\n';
  xml += '  <Cell ss:StyleID="header"><Data ss:Type="String">Specialty</Data></Cell>\n';
  xml += '  <Cell ss:StyleID="header"><Data ss:Type="String">Count</Data></Cell>\n';
  xml += '</Row>\n';

  for (var s = 0; s < specKeys.length; s++) {
    xml += '<Row>\n';
    xml += '  <Cell ss:StyleID="data"><Data ss:Type="String">' +
      escapeXml(specKeys[s]) +
      '</Data></Cell>\n';
    xml += '  <Cell ss:StyleID="countNum"><Data ss:Type="Number">' +
      specCounts[specKeys[s]] +
      '</Data></Cell>\n';
    xml += '</Row>\n';
  }

  xml += '<Row><Cell><Data ss:Type="String"></Data></Cell></Row>\n';

  xml += '<Row>\n';
  xml += '  <Cell ss:StyleID="section" ss:MergeAcross="1"><Data ss:Type="String">Top Sponsors</Data></Cell>\n';
  xml += '</Row>\n';

  xml += '<Row>\n';
  xml += '  <Cell ss:StyleID="header"><Data ss:Type="String">Sponsor</Data></Cell>\n';
  xml += '  <Cell ss:StyleID="header"><Data ss:Type="String">Count</Data></Cell>\n';
  xml += '</Row>\n';

  var maxSponsors = Math.min(sponsorKeys.length, 10);

  for (var sp = 0; sp < maxSponsors; sp++) {
    xml += '<Row>\n';
    xml += '  <Cell ss:StyleID="data"><Data ss:Type="String">' +
      escapeXml(sponsorKeys[sp]) +
      '</Data></Cell>\n';
    xml += '  <Cell ss:StyleID="countNum"><Data ss:Type="Number">' +
      sponsorCounts[sponsorKeys[sp]] +
      '</Data></Cell>\n';
    xml += '</Row>\n';
  }

  xml += '</Table>\n';
  xml += '</Worksheet>\n';

  xml += '<Worksheet ss:Name="All Approvals">\n';
  xml += '<Table ss:DefaultRowHeight="22">\n';

  xml += '<Column ss:Width="30"/>\n';
  xml += '<Column ss:Width="150"/>\n';
  xml += '<Column ss:Width="180"/>\n';
  xml += '<Column ss:Width="130"/>\n';
  xml += '<Column ss:Width="90"/>\n';
  xml += '<Column ss:Width="150"/>\n';
  xml += '<Column ss:Width="220"/>\n';
  xml += '<Column ss:Width="170"/>\n';
  xml += '<Column ss:Width="110"/>\n';
  xml += '<Column ss:Width="120"/>\n';
  xml += '<Column ss:Width="80"/>\n';
  xml += '<Column ss:Width="250"/>\n';
  xml += '<Column ss:Width="400"/>\n';

  xml += '<Row ss:Height="35">\n';
  xml += '  <Cell ss:StyleID="title" ss:MergeAcross="12"><Data ss:Type="String">FDA Drug Approvals - ' +
    escapeXml(formatDateDisplay(fromDate)) +
    " to " +
    escapeXml(formatDateDisplay(toDate)) +
    '</Data></Cell>\n';
  xml += '</Row>\n';

  var headers = [
    "#",
    "Drug Name",
    "Generic Name",
    "Specialty",
    "Approval Date",
    "Submission Type",
    "Approval Type",
    "Sponsor",
    "Application #",
    "Dosage Form",
    "Route",
    "Active Ingredients",
    "Indication / Use"
  ];

  xml += '<Row ss:Height="30">\n';

  for (var h = 0; h < headers.length; h++) {
    xml += '  <Cell ss:StyleID="header"><Data ss:Type="String">' +
      escapeXml(headers[h]) +
      '</Data></Cell>\n';
  }

  xml += '</Row>\n';

  for (var d = 0; d < approvals.length; d++) {
    var app = approvals[d];
    var isAlt = d % 2 === 1;
    var rowStyle = isAlt ? "dataAlt" : "data";
    var nameStyle = isAlt ? "drugNameAlt" : "drugName";

    xml += '<Row>\n';

    xml += '  <Cell ss:StyleID="' + rowStyle + '"><Data ss:Type="Number">' +
      (d + 1) +
      '</Data></Cell>\n';

    xml += '  <Cell ss:StyleID="' + nameStyle + '"><Data ss:Type="String">' +
      escapeXml(app.drug_name) +
      '</Data></Cell>\n';

    xml += '  <Cell ss:StyleID="' + rowStyle + '"><Data ss:Type="String">' +
      escapeXml(app.generic_name) +
      '</Data></Cell>\n';

    xml += '  <Cell ss:StyleID="' + rowStyle + '"><Data ss:Type="String">' +
      escapeXml(app.specialty) +
      '</Data></Cell>\n';

    xml += '  <Cell ss:StyleID="' + rowStyle + '"><Data ss:Type="String">' +
      escapeXml(app.approval_date) +
      '</Data></Cell>\n';

    xml += '  <Cell ss:StyleID="' + rowStyle + '"><Data ss:Type="String">' +
      escapeXml(app.submission_type) +
      '</Data></Cell>\n';

    xml += '  <Cell ss:StyleID="' + rowStyle + '"><Data ss:Type="String">' +
      escapeXml(app.approval_type) +
      '</Data></Cell>\n';

    xml += '  <Cell ss:StyleID="' + rowStyle + '"><Data ss:Type="String">' +
      escapeXml(app.sponsor) +
      '</Data></Cell>\n';

    xml += '  <Cell ss:StyleID="' + rowStyle + '"><Data ss:Type="String">' +
      escapeXml(app.application_number) +
      '</Data></Cell>\n';

    xml += '  <Cell ss:StyleID="' + rowStyle + '"><Data ss:Type="String">' +
      escapeXml(app.dosage_form) +
      '</Data></Cell>\n';

    xml += '  <Cell ss:StyleID="' + rowStyle + '"><Data ss:Type="String">' +
      escapeXml(app.route) +
      '</Data></Cell>\n';

    xml += '  <Cell ss:StyleID="' + rowStyle + '"><Data ss:Type="String">' +
      escapeXml(app.active_ingredients) +
      '</Data></Cell>\n';

    xml += '  <Cell ss:StyleID="' + rowStyle + '"><Data ss:Type="String">' +
      escapeXml(app.indication) +
      '</Data></Cell>\n';

    xml += '</Row>\n';
  }

  xml += '</Table>\n';
  xml += '</Worksheet>\n';

  xml += '<Worksheet ss:Name="By Specialty">\n';
  xml += '<Table ss:DefaultRowHeight="22">\n';

  xml += '<Column ss:Width="150"/>\n';
  xml += '<Column ss:Width="180"/>\n';
  xml += '<Column ss:Width="90"/>\n';
  xml += '<Column ss:Width="150"/>\n';
  xml += '<Column ss:Width="220"/>\n';
  xml += '<Column ss:Width="170"/>\n';
  xml += '<Column ss:Width="400"/>\n';

  xml += '<Row ss:Height="35">\n';
  xml += '  <Cell ss:StyleID="title" ss:MergeAcross="6"><Data ss:Type="String">Approvals Grouped by Specialty</Data></Cell>\n';
  xml += '</Row>\n';

  for (var sk = 0; sk < specKeys.length; sk++) {
    var specName = specKeys[sk];

    xml += '<Row ss:Height="28">\n';
    xml += '  <Cell ss:StyleID="specGroup" ss:MergeAcross="6"><Data ss:Type="String">' +
      escapeXml(specName) +
      " (" +
      specCounts[specName] +
      ")" +
      '</Data></Cell>\n';
    xml += '</Row>\n';

    var specHeaders = [
      "Drug Name",
      "Generic Name",
      "Approval Date",
      "Submission Type",
      "Approval Type",
      "Sponsor",
      "Indication"
    ];

    xml += '<Row>\n';

    for (var sh = 0; sh < specHeaders.length; sh++) {
      xml += '  <Cell ss:StyleID="header"><Data ss:Type="String">' +
        escapeXml(specHeaders[sh]) +
        '</Data></Cell>\n';
    }

    xml += '</Row>\n';

    var rowCount = 0;

    for (var sd = 0; sd < approvals.length; sd++) {
      if (approvals[sd].specialty === specName) {
        var isAlt2 = rowCount % 2 === 1;
        var rs = isAlt2 ? "dataAlt" : "data";
        var ns = isAlt2 ? "drugNameAlt" : "drugName";

        xml += '<Row>\n';

        xml += '  <Cell ss:StyleID="' + ns + '"><Data ss:Type="String">' +
          escapeXml(approvals[sd].drug_name) +
          '</Data></Cell>\n';

        xml += '  <Cell ss:StyleID="' + rs + '"><Data ss:Type="String">' +
          escapeXml(approvals[sd].generic_name) +
          '</Data></Cell>\n';

        xml += '  <Cell ss:StyleID="' + rs + '"><Data ss:Type="String">' +
          escapeXml(approvals[sd].approval_date) +
          '</Data></Cell>\n';

        xml += '  <Cell ss:StyleID="' + rs + '"><Data ss:Type="String">' +
          escapeXml(approvals[sd].submission_type) +
          '</Data></Cell>\n';

        xml += '  <Cell ss:StyleID="' + rs + '"><Data ss:Type="String">' +
          escapeXml(approvals[sd].approval_type) +
          '</Data></Cell>\n';

        xml += '  <Cell ss:StyleID="' + rs + '"><Data ss:Type="String">' +
          escapeXml(approvals[sd].sponsor) +
          '</Data></Cell>\n';

        xml += '  <Cell ss:StyleID="' + rs + '"><Data ss:Type="String">' +
          escapeXml(approvals[sd].indication) +
          '</Data></Cell>\n';

        xml += '</Row>\n';

        rowCount++;
      }
    }

    xml += '<Row><Cell><Data ss:Type="String"></Data></Cell></Row>\n';
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

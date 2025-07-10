document.addEventListener("DOMContentLoaded", () => {
    // Shared bolding function (copied from your main project for standalone use)
    const FINDINGS_KEYWORDS = ["DICU", "DMV", "DPE", "GCS", "sed", "FiO2", "vaso", "WBC", "Hb", "PLT", "PT", "PTT", "INR", "Na", "K", "Cl", "Mg", "PO4", "BUN", "Cr", "GFR", "AST", "ALT", "TBil", "DBil", "ALP", "Alb", "Trop", "CK", "LDH", "pH", "pCO2", "HCO3", "Lact", "I/O", "NGF", "IVF", "Septic"];
    const FINDINGS_REGEXES = FINDINGS_KEYWORDS.map(keyword => ({ keyword, regex: new RegExp(`\\b${keyword}:`, 'gi') }));
    function boldFindings(text) {
        if (typeof text !== 'string' || !text) return "";
        let updatedText = text;
        FINDINGS_REGEXES.forEach(({ keyword, regex }) => {
            regex.lastIndex = 0;
            updatedText = updatedText.replace(regex, `<strong>${keyword}:</strong>`);
        });
        return updatedText;
    }

    // DOM Element Caching
    const recreatedTableContainer = document.getElementById("recreatedTableContainer");
    const startScanBtn = document.getElementById("startScanBtn");
    const qrReaderElement = document.getElementById("qr-reader");
    const qrReaderResults = document.getElementById("qr-reader-results");
    const pdfActionContainer = document.getElementById("pdfActionContainer");
    const downloadPDFBtn = document.getElementById("downloadPDFBtn");
    let html5QrCode = null;

    if (!recreatedTableContainer || !startScanBtn || !qrReaderElement || !qrReaderResults || !pdfActionContainer || !downloadPDFBtn) {
        console.error("Initialization failed: Essential DOM elements are missing.");
        document.body.innerHTML = "<h1>Error</h1><p>Page could not be initialized. Required elements are missing.</p>";
        return;
    }

    // This function is called on successful scan
    function onScanSuccess(decodedText, decodedResult) {
        qrReaderResults.textContent = "Scan successful! Table generated below.";
        
        // Stop the scanner if it's running
        if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().then(() => {
                qrReaderElement.classList.add('hidden');
                startScanBtn.textContent = "Start New Scan";
                startScanBtn.disabled = false;
            }).catch(err => console.error("Failed to stop scanning.", err));
        }

        // Directly create the table from the scanned text
        recreateTableFromText(decodedText);
    }

    function onScanFailure(error) { /* Ignore frequent errors, they are noisy */ }
    
    function startScanner() {
        if (typeof Html5Qrcode === 'undefined') {
            alert("Error: QR Code scanning library could not be loaded. Check internet connection.");
            return;
        }
        if (!html5QrCode) {
             html5QrCode = new Html5Qrcode("qr-reader");
        }
        qrReaderElement.classList.remove('hidden');
        pdfActionContainer.classList.add('hidden'); // Hide PDF button during scan
        recreatedTableContainer.innerHTML = ''; // Clear old table
        qrReaderResults.textContent = "Point camera at QR code...";
        startScanBtn.textContent = "Scanning...";
        startScanBtn.disabled = true;

        const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
        html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, onScanFailure)
        .catch(err => {
            console.error("Unable to start scanning.", err);
            qrReaderResults.innerHTML = `<span style="color:red;">Error: Could not start camera. Please grant camera permissions and ensure you are on a secure (https://) connection.</span>`;
            qrReaderElement.classList.add('hidden');
            startScanBtn.textContent = "Try Again";
            startScanBtn.disabled = false;
        });
    }

    // This function now accepts the scanned text as an argument
    function recreateTableFromText(inputText) {
        if (!inputText || !inputText.trim()) {
            recreatedTableContainer.innerHTML = "<p>Scanned QR code was empty.</p>";
            pdfActionContainer.classList.add('hidden');
            return;
        }

        const QR_COLUMN_SEPARATOR = '|~|';
        const QR_ROW_SEPARATOR = '\n';
        const rows = inputText.split(QR_ROW_SEPARATOR);

        if (rows.length === 0) {
            recreatedTableContainer.innerHTML = "<p>No data rows found in QR code.</p>";
            pdfActionContainer.classList.add('hidden');
            return;
        }
        
        const table = document.createElement('table');
        table.id = 'recreatedTable';
        
        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        const headers = ["Bed/Patient", "Problems", "Findings", "Medications"];
        headers.forEach(headerText => {
            const th = document.createElement('th');
            th.textContent = headerText;
            headerRow.appendChild(th);
        });
        
        const tbody = table.createTBody();
        // --- PERFORMANCE FIX ---
        // Create a DocumentFragment to build the rows off-screen
        const fragment = document.createDocumentFragment();

        rows.forEach(rowData => {
            if (!rowData.trim()) return;
            // Create the row element
            const bodyRow = document.createElement('tr');
            const cells = rowData.split(QR_COLUMN_SEPARATOR);

            cells.forEach((cellText, index) => {
                const td = bodyRow.insertCell();
                // Only apply bolding to the "Findings" column (index 2)
                td.innerHTML = (index === 2) ? boldFindings(cellText) : cellText;
            });
            // Ensure every row has the correct number of cells
            while (bodyRow.cells.length < headers.length) {
                bodyRow.insertCell().textContent = "";
            }
            // Append the completed row to the fragment, not the live table
            fragment.appendChild(bodyRow);
        });
        
        // Append the entire fragment to the table body at once
        tbody.appendChild(fragment);
        
        recreatedTableContainer.innerHTML = '';
        recreatedTableContainer.appendChild(table);
        pdfActionContainer.classList.remove('hidden'); // Show the PDF download button
    }

    function generatePDF() {
        const table = document.getElementById('recreatedTable');
        if (!table) {
            alert("No table found to generate a PDF.");
            return;
        }
        if (typeof jspdf === 'undefined' || typeof html2canvas === 'undefined') {
            alert("Error: PDF generation libraries not loaded. Check your internet connection.");
            return;
        }
        
        const { jsPDF } = window.jspdf;
        downloadPDFBtn.textContent = "Generating...";
        downloadPDFBtn.disabled = true;
        
        // Temporarily set background to white for capture
        table.style.backgroundColor = '#ffffff';

        html2canvas(table, { scale: 2, useCORS: true })
            .then(canvas => {
                // Restore original background color
                table.style.backgroundColor = '';
                const imgData = canvas.toDataURL('image/png');
                const pdf = new jsPDF({
                    orientation: 'landscape',
                    unit: 'pt',
                    format: 'a4'
                });
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = pdf.internal.pageSize.getHeight();
                const margin = 40; // 20pt on each side
                const imgWidth = canvas.width;
                const imgHeight = canvas.height;
                
                const ratio = Math.min((pdfWidth - margin) / imgWidth, (pdfHeight - margin) / imgHeight);
                const finalWidth = imgWidth * ratio;
                const finalHeight = imgHeight * ratio;
                
                const x = (pdfWidth - finalWidth) / 2;
                const y = (pdfHeight - finalHeight) / 2;
                
                pdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight);
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                pdf.save(`icu_summary_${timestamp}.pdf`);
            })
            .catch(err => {
                console.error("PDF generation failed:", err);
                alert("An error occurred while generating the PDF.");
            })
            .finally(() => {
                downloadPDFBtn.textContent = "Download as PDF";
                downloadPDFBtn.disabled = false;
            });
    }

    // Event Listeners
    startScanBtn.addEventListener('click', startScanner);
    downloadPDFBtn.addEventListener('click', generatePDF);
});

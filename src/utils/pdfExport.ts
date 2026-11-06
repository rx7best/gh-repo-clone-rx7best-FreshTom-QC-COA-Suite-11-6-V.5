import { domToCanvas } from 'modern-screenshot';
import { jsPDF } from 'jspdf';

export interface ExportPdfOptions {
  filename?: string;
  scale?: number;
  captureWidth?: number;
  orientation?: 'portrait' | 'landscape';
  marginMm?: number;
}

/**
 * Universal high-resolution PDF exporter using modern-screenshot + jsPDF
 */
export async function exportElementToPdf(
  elementOrId: HTMLElement | string,
  optionsOrFilename: ExportPdfOptions | string = {}
): Promise<boolean> {
  const options: ExportPdfOptions =
    typeof optionsOrFilename === 'string'
      ? { filename: optionsOrFilename }
      : optionsOrFilename;

  const {
    filename = 'Report.pdf',
    scale = 2.2,
    captureWidth = 794,
    orientation = 'portrait',
    marginMm = 6,
  } = options;

  const element: HTMLElement | null =
    typeof elementOrId === 'string'
      ? document.getElementById(elementOrId)
      : elementOrId;

  if (!element) {
    console.error(`exportElementToPdf: Element not found (${elementOrId})`);
    return false;
  }

  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    const captureHeight = element.scrollHeight || element.offsetHeight || 1123;

    let canvas: HTMLCanvasElement;
    try {
      canvas = await domToCanvas(element, {
        width: captureWidth,
        height: captureHeight,
        scale,
        backgroundColor: '#ffffff',
        timeout: 10000,
        style: {
          transform: 'none',
          width: `${captureWidth}px`,
          minWidth: `${captureWidth}px`,
          maxWidth: `${captureWidth}px`,
          margin: '0',
        },
      });
    } catch {
      // Fallback with font: false if remote webfonts fail
      canvas = await domToCanvas(element, {
        width: captureWidth,
        height: captureHeight,
        scale,
        backgroundColor: '#ffffff',
        font: false,
        style: {
          transform: 'none',
          width: `${captureWidth}px`,
          minWidth: `${captureWidth}px`,
          maxWidth: `${captureWidth}px`,
          margin: '0',
        },
      });
    }

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageWidthMm = orientation === 'portrait' ? 210 : 297;
    const pageHeightMm = orientation === 'portrait' ? 297 : 210;
    const maxContentWidthMm = pageWidthMm - marginMm * 2;
    const maxContentHeightMm = pageHeightMm - marginMm * 2;

    const aspectRatio = canvas.height / canvas.width;
    let renderWidthMm = maxContentWidthMm;
    let renderHeightMm = renderWidthMm * aspectRatio;

    if (marginMm === 0) {
      pdf.addImage(imgData, 'PNG', 0, 0, pageWidthMm, pageHeightMm, undefined, 'FAST');
    } else if (renderHeightMm > maxContentHeightMm) {
      // If slight overflow (less than 15%), scale to fit 1 page
      if (renderHeightMm <= maxContentHeightMm * 1.15) {
        renderHeightMm = maxContentHeightMm;
        renderWidthMm = renderHeightMm / aspectRatio;
        const offsetX = (pageWidthMm - renderWidthMm) / 2;
        pdf.addImage(imgData, 'PNG', offsetX, marginMm, renderWidthMm, renderHeightMm, undefined, 'FAST');
      } else {
        // Multi-page slice
        let heightLeft = renderHeightMm;
        let position = marginMm;

        pdf.addImage(imgData, 'PNG', marginMm, position, renderWidthMm, renderHeightMm, undefined, 'FAST');
        heightLeft -= maxContentHeightMm;

        while (heightLeft > 0) {
          position = heightLeft - renderHeightMm + marginMm;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', marginMm, position, renderWidthMm, renderHeightMm, undefined, 'FAST');
          heightLeft -= maxContentHeightMm;
        }
      }
    } else {
      const offsetX = (pageWidthMm - renderWidthMm) / 2;
      pdf.addImage(imgData, 'PNG', offsetX, marginMm, renderWidthMm, renderHeightMm, undefined, 'FAST');
    }

    const safeFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    const pdfBlob = pdf.output('blob');
    const blobUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = safeFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);

    return true;
  } catch (err) {
    console.error('PDF export failed:', err);
    return false;
  }
}

/**
 * Triggers native browser print with a specific temporary body class for styling
 */
export function printWithClass(className: string): void {
  document.body.classList.add(className);
  window.print();
  setTimeout(() => {
    document.body.classList.remove(className);
  }, 1000);
}

import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const simId = url.searchParams.get('simId');

  if (!simId) {
    return NextResponse.json({ error: 'Missing simId' }, { status: 400 });
  }

  const adminDb = getAdminDb();
  if (!adminDb) {
    return NextResponse.json({ error: 'DB init failed' }, { status: 500 });
  }

  const simDoc = await adminDb.collection('whatsappSimulations').doc(simId).get();
  if (!simDoc.exists) {
    return NextResponse.json({ error: 'Simulation not found' }, { status: 404 });
  }

  const data = simDoc.data();
  const params = data?.params || {};
  const topOffer = data?.topOffer || {};

  try {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const { height } = page.getSize();
    let y = height - 50;

    page.drawText('Relatório de Simulação - Portabilidade', { x: 50, y, size: 20, font: boldFont, color: rgb(0.06, 0.32, 0.83) });
    y -= 40;

    const drawRow = (label: string, value: string) => {
      page.drawText(`${label}:`, { x: 50, y, size: 12, font: boldFont, color: rgb(0.2, 0.2, 0.2) });
      page.drawText(`${value}`, { x: 220, y, size: 12, font: font, color: rgb(0.3, 0.3, 0.3) });
      y -= 25;
    };

    const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

    page.drawText('Dados do Contrato Original', { x: 50, y, size: 16, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
    y -= 30;
    
    drawRow('Convênio', params.convenio || 'N/A');
    drawRow('Banco Atual', params.bancoAtual || 'N/A');
    drawRow('Valor da Parcela', formatCurrency(params.valorParcela));
    drawRow('Saldo Devedor', formatCurrency(params.saldoDevedor));
    
    const prazoTotal = params.prazoTotal || 0;
    let pagas = params.parcelasPagas || 0;
    let restantes = params.parcelasRestantes || 0;
    if (restantes === 0 && pagas > 0 && prazoTotal > 0) restantes = prazoTotal - pagas;
    else if (pagas === 0 && restantes > 0 && prazoTotal > 0) pagas = prazoTotal - restantes;

    drawRow('Prazo Original', `${prazoTotal} meses`);
    if (pagas > 0 || restantes > 0) {
      drawRow('Situação', `${pagas} pagas / ${restantes} restantes`);
    }

    y -= 20;
    page.drawText('Melhor Oferta Encontrada', { x: 50, y, size: 16, font: boldFont, color: rgb(0.06, 0.72, 0.5) });
    y -= 30;

    if (topOffer && topOffer.name) {
      drawRow('Banco Destino', topOffer.name);
      drawRow('Tabela', topOffer.tabela);
      drawRow('Valor do Contrato', formatCurrency(topOffer.valorContrato));
      drawRow('Valor do Troco (Liberado)', formatCurrency(topOffer.valorTroco));
      drawRow('Taxa de Juros (Port)', `${(topOffer.novaTaxaPortabilidade || 0).toFixed(2)}% a.m.`);
      drawRow('Novo Prazo', `${topOffer.prazoRefinPort || prazoTotal} meses`);
    } else {
      page.drawText('Nenhuma oferta de troco foi encontrada para estas condições.', { x: 50, y, size: 12, font, color: rgb(0.5, 0.5, 0.5) });
    }

    y -= 40;
    page.drawText('Simulação meramente informativa, não garante aprovação de crédito.', { x: 50, y, size: 10, font: font, color: rgb(0.6, 0.6, 0.6) });

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="simulacao-${topOffer?.name || 'portabilidade'}.pdf"`
      }
    });

  } catch (error: any) {
    console.error("PDF generation error: ", error);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}

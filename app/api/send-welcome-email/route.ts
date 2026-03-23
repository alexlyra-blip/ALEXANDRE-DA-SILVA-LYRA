import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const { email, password, name } = await req.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    // If email configuration is missing, just log it and return success
    if (!process.env.EMAIL_SERVER_HOST || !process.env.EMAIL_SERVER_USER) {
      console.log(`[Email Mock] Welcome email would have been sent to ${email} with password ${password}`);
      return NextResponse.json({ message: 'Email mocked successfully' });
    }

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_SERVER_HOST,
      port: Number(process.env.EMAIL_SERVER_PORT),
      auth: {
        user: process.env.EMAIL_SERVER_USER,
        pass: process.env.EMAIL_SERVER_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Bem-vindo ao nosso portal!',
      html: `
        <h1>Olá, ${name}!</h1>
        <p>Seja bem-vindo ao nosso portal. Sua conta foi criada com sucesso.</p>
        <p>Aqui estão suas credenciais de acesso:</p>
        <ul>
          <li><strong>E-mail:</strong> ${email}</li>
          <li><strong>Senha:</strong> ${password}</li>
        </ul>
        <p>Você pode acessar o portal através do link: <a href="${appUrl}">${appUrl}</a></p>
        <p>Recomendamos que você altere sua senha após o primeiro acesso.</p>
      `,
    });

    return NextResponse.json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}

import { GET } from '../app/api/admin/whatsapp-history/route.ts';
import { NextRequest } from 'next/server';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env.local' });
dotenv.config({ path: '../.env' });

async function testApi() {
  const req = new NextRequest('http://localhost/api/admin/whatsapp-history');
  try {
    const res = await GET(req);
    console.log("Status:", res.status);
    console.log("Body:", await res.text());
  } catch (e) {
    console.log("Exception:", e);
  }
}
testApi();

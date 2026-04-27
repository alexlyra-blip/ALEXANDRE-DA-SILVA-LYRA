import { NextResponse } from 'next/server';
import { db } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const banksSnap = await getDocs(collection(db, 'bankRules'));
    const banks = banksSnap.docs.map(d => ({id: d.id, ...d.data()}));
    
    // Find daycoval
    const daycoval = banks.find(b => b.name.toLowerCase().includes('daycoval'));
    
    const generalRulesSnap = await getDocs(collection(db, 'generalRules'));
    const generalRules = generalRulesSnap.docs.map(d => ({id: d.id, ...d.data()}));
    
    return NextResponse.json({ daycoval, generalRules });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

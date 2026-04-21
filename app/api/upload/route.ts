import { NextResponse } from 'next/server';
import { getAdminStorage, admin } from '@/lib/firebase-admin';
import firebaseConfig from '@/firebase-applet-config.json';

console.log('[API Upload] Route file loaded');

export async function POST(request: Request) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[API Upload ${requestId}] Received upload request`);
  
  try {
    const storage = getAdminStorage();
    if (!storage) {
      return NextResponse.json({ error: 'Firebase Storage connection failed' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const path = formData.get('path') as string;
    
    // Generate a unique path to avoid overwrites and permission issues
    const fileExtension = file.name.split('.').pop() || '';
    const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const uniquePath = path.replace(/(\.[^/.]+)?$/, `_${uniqueId}${fileExtension ? '.' + fileExtension : ''}`);
    
    console.log(`[API Upload ${requestId}] File: ${file.name}, Size: ${file.size}, Type: ${file.type}, Original Path: ${path}, Unique Path: ${uniquePath}`);

    // Validation
    if (file.size > 2 * 1024 * 1024) { // Increased to 2MB for admin
      console.error(`[API Upload ${requestId}] File too large: ${file.size} bytes`);
      return NextResponse.json({ error: 'Arquivo muito grande. Limite de 2MB.' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      console.error(`[API Upload ${requestId}] Invalid file type: ${file.type}`);
      return NextResponse.json({ error: 'O arquivo deve ser uma imagem.' }, { status: 400 });
    }

    // Try multiple bucket name variations
    const bucketNames = [
      firebaseConfig.storageBucket,
      `${firebaseConfig.projectId}.appspot.com`,
      firebaseConfig.projectId,
      null // Try default bucket
    ];
    
    console.log(`[API Upload ${requestId}] Bucket candidates:`, bucketNames);
    
    console.log(`[API Upload ${requestId}] Converting file to buffer...`);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Generate a download token
    const downloadToken = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    
    let lastError = null;
    let successfulBucket = null;

    for (const bucketName of bucketNames) {
      try {
        console.log(`[API Upload ${requestId}] Attempting upload to bucket: ${bucketName || 'default'}`);
        const bucket = bucketName ? storage.bucket(bucketName) : storage.bucket();
        const blob = bucket.file(uniquePath);
        
        await blob.save(buffer, {
          metadata: {
            contentType: file.type,
            metadata: {
              firebaseStorageDownloadTokens: downloadToken
            }
          },
        });
        
        successfulBucket = bucketName || bucket.name;
        console.log(`[API Upload ${requestId}] Upload successful to bucket: ${successfulBucket}`);
        break;
      } catch (err: any) {
        console.warn(`[API Upload ${requestId}] Failed to upload to ${bucketName || 'default'}:`, err.message);
        lastError = err;
        // Continue to next bucket candidate
      }
    }

    if (!successfulBucket) {
      console.error(`[API Upload ${requestId}] All bucket upload attempts failed.`);
      throw lastError || new Error('All bucket upload attempts failed.');
    }
    
    // Construct the standard Firebase Storage download URL with the token
    const encodedPath = encodeURIComponent(uniquePath);
    const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${successfulBucket}/o/${encodedPath}?alt=media&token=${downloadToken}`;
    
    console.log(`[API Upload ${requestId}] Generated URL: ${downloadURL}`);

    return NextResponse.json({ imageUrl: downloadURL });
  } catch (error: any) {
    console.error(`[API Upload ${requestId}] Unexpected error during admin upload:`, error);
    
    // Specific error handling for 403 Forbidden
    if (error.code === 403 || error.message.includes('403') || error.message.includes('Permission') || error.message.includes('denied')) {
      return NextResponse.json({ 
        error: 'Sem permissão para enviar imagem ao bucket. Verifique as permissões IAM do Google Cloud Storage.'
      }, { status: 403 });
    }

    return NextResponse.json({ 
      error: error.message || 'Erro interno no servidor durante o upload (Admin).',
      details: error.stack
    }, { status: 500 });
  }
}

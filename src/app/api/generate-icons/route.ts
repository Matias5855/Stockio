// Este endpoint genera los íconos automáticamente
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ message: 'Subí manualmente icon-192.png y icon-512.png a /public' })
}
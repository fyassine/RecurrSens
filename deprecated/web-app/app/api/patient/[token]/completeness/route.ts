import { NextRequest, NextResponse } from 'next/server';
import { getPatientCompleteness } from '@/lib/api';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const completeness = await getPatientCompleteness(token);

  if (completeness.missing.includes('patientNotFound')) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
  }

  return NextResponse.json(completeness);
}

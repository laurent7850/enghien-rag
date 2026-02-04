import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  const checks: Record<string, { status: string; error?: string }> = {};

  // Test Database connection
  try {
    const result = await query<{ count: string }>('SELECT COUNT(*) as count FROM enghien_documents');
    checks.database = {
      status: 'ok',
      error: `${result[0]?.count || 0} documents`
    };
  } catch (error) {
    checks.database = {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }

  // Test OpenRouter API key
  checks.openrouter = {
    status: process.env.OPENROUTER_API_KEY ? 'ok' : 'error',
    error: process.env.OPENROUTER_API_KEY ? 'API key present' : 'Missing API key',
  };

  // Test DATABASE_URL
  checks.database_url = {
    status: process.env.DATABASE_URL ? 'ok' : 'error',
    error: process.env.DATABASE_URL
      ? `URL: ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`
      : 'Missing DATABASE_URL',
  };

  const allOk = Object.values(checks).every(c => c.status === 'ok');

  return NextResponse.json({
    status: allOk ? 'healthy' : 'unhealthy',
    checks
  }, {
    status: allOk ? 200 : 500
  });
}

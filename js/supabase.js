const SUPABASE_URL = "https://ofohjebtyppsxgjuqxme.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mb2hqZWJ0eXBwc3hnanVxeG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MTEyODUsImV4cCI6MjA5ODM4NzI4NX0.koW1I7dFrBToH9azx3TPZwyFrY1HIr2XAgFS72DRI34";
const TABLE_NAME = "trading_journal";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

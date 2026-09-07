import { createAdminSupabaseClient } from './adminSupabase';
import { toolConfiguration } from './toolCatalog.mjs';
export async function loadToolConfiguration(tool) {
 const {data,error}=await createAdminSupabaseClient().from('tool_settings').select('quantities').eq('tool_key',tool).maybeSingle();
 if(error)throw new Error('Tool quantities could not be loaded. Please try again.');
 return toolConfiguration(tool,data?.quantities || {});
}

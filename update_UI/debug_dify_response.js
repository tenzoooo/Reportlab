const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// Load .env.local manually
try {
    const envPath = path.resolve(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
        const envConfig = fs.readFileSync(envPath, "utf8");
        envConfig.split("\n").forEach((line) => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim().replace(/^["']|["']$/g, "");
                process.env[key] = value;
            }
        });
    }
} catch (e) {
    console.error("Failed to load .env.local", e);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase credentials");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
    const { data, error } = await supabase
        .from("analysis_results")
        .select("dify_response")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

    if (error) {
        console.error("Error fetching analysis result:", error);
        return;
    }

    if (!data) {
        console.log("No analysis results found");
        return;
    }

    console.log(JSON.stringify(data.dify_response, null, 2));
}

main();

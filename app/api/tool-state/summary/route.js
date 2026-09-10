import { NextResponse } from "next/server";
import { ACCOUNT_SUMMARY_SOURCE_KEYS } from "../../../../lib/accountProgressionSummary.mjs";
import { readMemberSession } from "../../../../lib/memberAuth";
import { getCollection } from "../../../../lib/mongo";
import { COLLECTIONS } from "../../../../lib/mongoCollections";

export async function GET(request) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ error: "Member login required." }, { status: 401 });

  try {
    const collection = await getCollection(COLLECTIONS.MEMBER_TOOL_STATE);
    const records = await collection.find(
      { member_id: session.memberId, tool_key: { $in: ACCOUNT_SUMMARY_SOURCE_KEYS } },
      { projection: { tool_key: 1, state: 1, updated_at: 1, _id: 0 } },
    ).toArray();
    const sources = Object.fromEntries(records.map((record) => [record.tool_key, { state: record.state, updatedAt: record.updated_at || null }]));
    return NextResponse.json({ sources });
  } catch (error) {
    console.error("account progression summary GET failed", error);
    return NextResponse.json({ error: "Unable to load saved tool summaries." }, { status: 500 });
  }
}

import pool from '../db/pool';

/**
 * Represents a single line item from a POS transaction.
 */
export interface TransactionLine {
  lineNo: number;
  category: string;
  amountTHB: number; // integer (whole baht)
}

/**
 * Result of points calculation for a single line.
 */
export interface LineResult {
  lineNo: number;
  category: string;
  amountTHB: number;
  winningCampaign: string | null; // null = BASE rate
  multiplierMillipercent: number; // 1000 = x1, 3000 = x3, 2500 = x2.5
  milliPoints: number; // integer milli-points for this line
}

/**
 * A campaign row from the DB.
 */
interface CampaignRow {
  campaign_id: string;
  multiplier_millipercent: number;
  category: string | null;
  tier: string | null;
  day_of_week: number[] | null;
  start_date: string | null;
  end_date: string | null;
  priority: number;
  is_active: boolean;
}

/**
 * BASE rate: 25 THB = 1 point => 1 THB = 1000/25 = 40 milli-points
 * With multiplier M (in millipercent, e.g. 3000 for x3):
 *   milliPoints = amountTHB * 40 * (M / 1000)
 *               = amountTHB * 40 * M / 1000
 *               = amountTHB * M / 25
 * All integer arithmetic — no floating point.
 */
const MILLI_POINTS_PER_THB_BASE = 40; // 1000 milli-points / 25 THB

/**
 * Calculates milli-points for one line item given a multiplier.
 * Formula: amountTHB * multiplierMillipercent / 25
 * This is exact integer division (using Math.floor but inputs are designed to be exact).
 */
export function calculateLineMilliPoints(
  amountTHB: number,
  multiplierMillipercent: number
): number {
  // amountTHB * multiplierMillipercent / 25
  // Since we do integer arithmetic: result is always an integer because
  // multiplierMillipercent is always a multiple of 100 (500, 1000, 2000, 2500, 3000, 5000)
  // and amountTHB is an integer. So amountTHB * multiplierMillipercent is always divisible
  // by 25? Not necessarily. E.g. 47 * 1000 = 47000 / 25 = 1880 ✓
  // 749 * 2000 = 1498000 / 25 = 59920 ✓
  // This is exact for all multiples of 500 in multiplier with integer THB.
  // Actually: amountTHB * M where M is multiple of 500 => result / 25 = amountTHB * (M/25)
  // M/25: 1000/25=40, 2000/25=80, 2500/25=100, 3000/25=120, 5000/25=200 — all integers!
  // So formula is always exact: no remainder, no rounding needed at line level.
  return (amountTHB * multiplierMillipercent) / 25;
}

/**
 * Gets the day of week (0=Sun, 6=Sat) for a date in Asia/Bangkok timezone.
 */
export function getBangkokDayOfWeek(dateStr: string): number {
  // dateStr is like "2026-09-27"
  // Parse as a date in Bangkok. Since we only deal with dates (not times),
  // and transactions carry their own date, we just parse the date directly.
  const [year, month, day] = dateStr.split('-').map(Number);
  // Create a date at noon UTC to avoid DST issues, then check day in Bangkok
  // Bangkok is UTC+7, so noon UTC is 19:00 Bangkok — same calendar day.
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return d.getUTCDay(); // 0=Sun through 6=Sat
}

/**
 * Determines if a campaign is active for the given context.
 */
function campaignMatches(
  campaign: CampaignRow,
  category: string,
  tier: string,
  dateStr: string,
  dayOfWeek: number
): boolean {
  if (!campaign.is_active) return false;

  // Category filter: if campaign specifies a category, line must match
  if (campaign.category && campaign.category !== category) return false;

  // Tier filter: if campaign specifies a tier, member must match
  if (campaign.tier && campaign.tier !== tier) return false;

  // Day of week filter
  if (campaign.day_of_week && campaign.day_of_week.length > 0) {
    if (!campaign.day_of_week.includes(dayOfWeek)) return false;
  }

  // Date range filter
  if (campaign.start_date && dateStr < campaign.start_date) return false;
  if (campaign.end_date && dateStr > campaign.end_date) return false;

  return true;
}

/**
 * For a single line item, finds the winning campaign (highest multiplier;
 * ties broken by priority, then campaign_id alphabetically for determinism).
 * Returns the campaign_id and multiplier, or null/1000 for base rate.
 */
function resolveWinningCampaign(
  campaigns: CampaignRow[],
  category: string,
  tier: string,
  dateStr: string,
  dayOfWeek: number
): { campaignId: string | null; multiplierMillipercent: number } {
  let bestCampaign: CampaignRow | null = null;

  for (const c of campaigns) {
    if (!campaignMatches(c, category, tier, dateStr, dayOfWeek)) continue;

    if (!bestCampaign) {
      bestCampaign = c;
      continue;
    }

    // Best single multiplier wins (stakeholder: "they should get the best one")
    if (c.multiplier_millipercent > bestCampaign.multiplier_millipercent) {
      bestCampaign = c;
    } else if (c.multiplier_millipercent === bestCampaign.multiplier_millipercent) {
      // Tie-break: higher priority wins
      if (c.priority > bestCampaign.priority) {
        bestCampaign = c;
      } else if (c.priority === bestCampaign.priority) {
        // Final tie-break: alphabetical campaign_id for determinism
        if (c.campaign_id < bestCampaign.campaign_id) {
          bestCampaign = c;
        }
      }
    }
  }

  if (!bestCampaign || bestCampaign.multiplier_millipercent <= 1000) {
    // Base rate if no campaign beats x1
    return { campaignId: bestCampaign?.campaign_id ?? null, multiplierMillipercent: 1000 };
  }

  return {
    campaignId: bestCampaign.campaign_id,
    multiplierMillipercent: bestCampaign.multiplier_millipercent,
  };
}

/**
 * Calculates points for an entire basket of line items.
 *
 * Business rules:
 * - Per-line: determine winning campaign, calculate milli-points
 * - Per-basket: sum milli-points, then floor-divide by 1000 to get posted points
 * - Rounding happens ONCE at the basket level (stakeholder: "rounds down per basket")
 *
 * Returns line-level detail and basket total.
 */
export async function calculateBasketPoints(
  lines: TransactionLine[],
  tier: string,
  dateStr: string
): Promise<{ lineResults: LineResult[]; totalMilliPoints: number; pointsPosted: number }> {
  // Fetch all active campaigns
  const { rows: campaigns } = await pool.query<CampaignRow>(
    `SELECT campaign_id, multiplier_millipercent, category, tier, day_of_week,
            start_date::text as start_date, end_date::text as end_date, priority, is_active
     FROM campaigns WHERE is_active = true`
  );

  const dayOfWeek = getBangkokDayOfWeek(dateStr);
  const lineResults: LineResult[] = [];
  let totalMilliPoints = 0;

  for (const line of lines) {
    const { campaignId, multiplierMillipercent } = resolveWinningCampaign(
      campaigns,
      line.category,
      tier,
      dateStr,
      dayOfWeek
    );

    const milliPoints = calculateLineMilliPoints(line.amountTHB, multiplierMillipercent);

    lineResults.push({
      lineNo: line.lineNo,
      category: line.category,
      amountTHB: line.amountTHB,
      winningCampaign: campaignId,
      multiplierMillipercent,
      milliPoints,
    });

    totalMilliPoints += milliPoints;
  }

  // Round DOWN at basket level: floor(totalMilliPoints / 1000)
  const pointsPosted = Math.floor(totalMilliPoints / 1000);

  return { lineResults, totalMilliPoints, pointsPosted };
}

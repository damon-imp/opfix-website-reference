module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GHL_TOKEN            = process.env.GHL_TOKEN;
  const GHL_LOCATION_ID      = process.env.GHL_LOCATION_ID;
  const GHL_WORKFLOW_ID_XRAY = process.env.GHL_WORKFLOW_ID_XRAY;

  if (!GHL_TOKEN || !GHL_LOCATION_ID) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const p = req.body || {};
  if (!p.email) {
    return res.status(400).json({ error: 'Email required' });
  }

  // Build human-readable notes summary, grouped by pillar, for xray_notes_readable
  const readableNotes = buildReadableNotes(p.factors);

  // Build customFields, dropping any empty values so we don't overwrite
  // good data on the contact with blanks.
  const cf = [
    ['business_name',               p.business_name],
    ['industry',                    p.industry],
    ['year_started',                p.year_started],
    ['annual_revenue_range',        p.annual_revenue],
    ['annual_revenue_midpoint',     p.annual_revenue_used],
    ['revenue_midpoint',            p.annual_revenue_used],
    ['employee_count',              p.employee_count],
    ['primary_service',             p.primary_service],
    ['target_market',               p.target_market],
    ['current_tech_stack',          p.tech_stack],
    ['client_goal',                 p.client_goal],
    ['xray_total_score',            p.total_score],
    ['xray_tier',                   p.tier],
    ['engagement_price',            p.engagement_price],
    ['estimated_opportunity',       p.estimated_opportunity],
    ['est_annual_opportunity',      p.estimated_opportunity],
    ['monthly_bleed',               p.monthly_bleed],
    ['pillar_opportunity__ops',       p.pillar_ops_impact],
    ['pillar_opportunity__revenue',   p.pillar_rev_impact],
    ['pillar_opportunity__financial', p.pillar_fin_impact],
    ['pillar_opportunity__team',      p.pillar_team_impact],
    ['xray_factor_data',            p.factors ? JSON.stringify(p.factors) : undefined],
    ['xray_notes_readable',         readableNotes],
    ['xray_submission_date',        new Date().toISOString().slice(0, 10)],
    ['xray_report_status',          'In Production']
  ];

  const customFields = cf
    .filter(function(pair) {
      const v = pair[1];
      return v !== undefined && v !== null && v !== '';
    })
    .map(function(pair) {
      return { key: pair[0], value: String(pair[1]) };
    });

  const upsertBody = {
    locationId:  GHL_LOCATION_ID,
    firstName:   p.first_name   || '',
    lastName:    p.last_name    || '',
    email:       String(p.email).trim().toLowerCase(),
    phone:       p.phone        || '',
    companyName: p.business_name || '',
    customFields: customFields
  };

  const upsertRes = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + GHL_TOKEN,
      'Content-Type':  'application/json',
      'Version':       '2021-07-28'
    },
    body: JSON.stringify(upsertBody)
  });

  if (!upsertRes.ok) {
    const err = await upsertRes.json().catch(() => ({}));
    return res.status(upsertRes.status).json({ error: err.message || 'GHL upsert failed' });
  }

  const upsertData = await upsertRes.json();
  const contactId  = upsertData && upsertData.contact && upsertData.contact.id;

  if (contactId && GHL_WORKFLOW_ID_XRAY) {
    await fetch('https://services.leadconnectorhq.com/contacts/' + contactId + '/workflow/' + GHL_WORKFLOW_ID_XRAY, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + GHL_TOKEN,
        'Content-Type':  'application/json',
        'Version':       '2021-07-28'
      }
    }).catch(function() {});
  }

  return res.status(200).json({ success: true });
};

// Groups factors by pillar and formats them as a skimmable briefing doc
// for Damon. Shows the client's notes under each factor with score + bleed.
function buildReadableNotes(factors) {
  if (!Array.isArray(factors) || !factors.length) return '';

  const PILLAR_LABELS = {
    ops:  'OPERATIONS & SYSTEMS',
    rev:  'REVENUE & SALES',
    fin:  'FINANCIAL STRUCTURE',
    team: 'TEAM & LEADERSHIP'
  };
  const PILLAR_ORDER = ['ops', 'rev', 'fin', 'team'];
  const fmt$ = function(n) { return '$' + Math.round(Number(n) || 0).toLocaleString(); };

  const byPillar = { ops: [], rev: [], fin: [], team: [] };
  factors.forEach(function(f) {
    const bucket = byPillar[f.pillar];
    if (bucket) bucket.push(f);
  });

  const out = [];
  PILLAR_ORDER.forEach(function(key) {
    const list = byPillar[key];
    if (!list.length) return;
    out.push('── ' + PILLAR_LABELS[key] + ' ' + '─'.repeat(Math.max(0, 50 - PILLAR_LABELS[key].length)));
    list.forEach(function(f) {
      const scoreLine = f.id + '. ' + f.name + ' — score ' + (f.score || 0) + '/3, weight ' + f.weight + 'x, ' + fmt$(f.impact) + '/yr bleed';
      out.push(scoreLine);
      if (f.notes && String(f.notes).trim()) {
        out.push('   ' + String(f.notes).trim().replace(/\n/g, '\n   '));
      }
      out.push('');
    });
  });

  return out.join('\n').trim();
}

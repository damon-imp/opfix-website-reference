module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GHL_TOKEN            = process.env.GHL_TOKEN;
  const GHL_LOCATION_ID      = process.env.GHL_LOCATION_ID;
  const GHL_WORKFLOW_ID_FULL = process.env.GHL_WORKFLOW_ID_FULL;
  const GHL_WORKFLOW_ID_DQ   = process.env.GHL_WORKFLOW_ID_DQ;

  if (!GHL_TOKEN || !GHL_LOCATION_ID) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const {
    submissionType,
    firstName,
    lastName,
    email,
    phone,
    companyName,
    customFields
  } = req.body;

  const payload = {
    locationId:   GHL_LOCATION_ID,
    firstName,
    lastName,
    email,
    phone,
    companyName,
    customFields: customFields || []
  };

  const upsertRes = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + GHL_TOKEN,
      'Content-Type':  'application/json',
      'Version':       '2021-07-28'
    },
    body: JSON.stringify(payload)
  });

  if (!upsertRes.ok) {
    const err = await upsertRes.json().catch(() => ({}));
    return res.status(upsertRes.status).json({ error: err.message || 'GHL upsert failed' });
  }

  const upsertData = await upsertRes.json();
  const contactId  = upsertData && upsertData.contact && upsertData.contact.id;

  const workflowId = submissionType === 'disqualified'
    ? GHL_WORKFLOW_ID_DQ
    : GHL_WORKFLOW_ID_FULL;

  if (contactId && workflowId) {
    await fetch('https://services.leadconnectorhq.com/contacts/' + contactId + '/workflow/' + workflowId, {
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

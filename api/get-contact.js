module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GHL_TOKEN       = process.env.GHL_TOKEN;
  const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;

  if (!GHL_TOKEN || !GHL_LOCATION_ID) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const email = (req.body && req.body.email ? String(req.body.email) : '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  const authHeaders = {
    'Authorization': 'Bearer ' + GHL_TOKEN,
    'Content-Type':  'application/json',
    'Version':       '2021-07-28'
  };

  // Run contact search + custom-field list in parallel
  const [searchRes, cfListRes] = await Promise.all([
    fetch('https://services.leadconnectorhq.com/contacts/search', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        locationId: GHL_LOCATION_ID,
        filters:    [{ field: 'email', operator: 'eq', value: email }],
        pageLimit:  1
      })
    }),
    fetch('https://services.leadconnectorhq.com/locations/' + GHL_LOCATION_ID + '/customFields', {
      method: 'GET',
      headers: authHeaders
    })
  ]);

  if (!searchRes.ok) {
    const err = await searchRes.json().catch(() => ({}));
    return res.status(searchRes.status).json({ error: err.message || 'GHL contact search failed' });
  }

  const searchData = await searchRes.json();
  const contact    = searchData && searchData.contacts && searchData.contacts[0];

  if (!contact) {
    return res.status(404).json({ error: 'Contact not found for this email' });
  }

  // Build id -> fieldKey map from the custom-field definitions
  const idToKey = {};
  if (cfListRes.ok) {
    const cfList = await cfListRes.json().catch(() => ({}));
    (cfList.customFields || []).forEach(function(f) {
      if (f.id && f.fieldKey) {
        idToKey[f.id] = String(f.fieldKey).replace(/^contact\./, '');
      }
    });
  }

  // Translate the contact's customFields array into a keyed map
  const customFields = {};
  if (Array.isArray(contact.customFields)) {
    contact.customFields.forEach(function(cf) {
      const key = idToKey[cf.id];
      if (key && cf.value !== undefined && cf.value !== null) {
        customFields[key] = cf.value;
      }
    });
  }

  return res.status(200).json({
    id:          contact.id,
    firstName:   contact.firstName   || '',
    lastName:    contact.lastName    || '',
    email:       contact.email       || '',
    phone:       contact.phone       || '',
    companyName: contact.companyName || '',
    customFields: customFields
  });
};

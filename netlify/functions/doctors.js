exports.handler = async function () {
  try {
    const res = await fetch('https://www.sspcrs.ie/libr/html/pcrs_gp_contracts.xml');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();

    const doctors = [];
    const blocks = xml.match(/<Doctor>([\s\S]*?)<\/Doctor>/g) || [];

    for (const block of blocks) {
      const decode = s => s
        .replace(/&amp;/g, '&')
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/[‘’‚‛]/g, "'");

      const get = tag => {
        const m = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
        return m ? decode(m[1].trim()) : '';
      };

      if (get('Contract_Status') !== 'Active') continue;

      const gms = get('GMS_Number');
      const name = [get('Forename'), get('Surname')].filter(Boolean).join(' ');
      const address = [
        get('Address_Line1'),
        get('Address_Line2'),
        get('Address_Line3'),
        get('Address_Line4'),
        get('Eircode')
      ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');

      if (gms) doctors.push({ gms, name, address });
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400'
      },
      body: JSON.stringify(doctors)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};

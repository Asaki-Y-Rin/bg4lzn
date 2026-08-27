'use strict';

/**
 * ADIF (Amateur Data Interchange Format) parser for LoTW QSO logs.
 * Parses both plain text ADIF and the ADIF comment style:
 *   <QSO_DATE:8>20260101<CALL:6>BG4LZN<MODE:3>SSB<FREQ:9>14.200000<EOR>
 */

// Match a single ADIF field: <TAG:LEN>data
const FIELD_RE = /<([A-Z0-9_]+):(\d+)(?::([A-Z0-9]))?>([^<]*)/gi;
const EOR_RE = /<eor>/gi;

const MODE_MAP = {
  'SSB': 'SSB', 'CW': 'CW', 'FT8': 'FT8', 'FT4': 'FT4', 'FM': 'FM',
  'AM': 'AM', 'RTTY': 'RTTY', 'PSK31': 'PSK31', 'JT65': 'JT65',
  'DIGITALVOICE':'D-STAR', 'FSK441':'FSK441', 'JT6M':'JT6M'
};

function toInt(v) {
  const n = parseInt(v, 10);
  return isNaN(n) ? 0 : n;
}

function normalizeDate(dateStr) {
  // ADIF dates are YYYYMMDD
  if (!dateStr) return '';
  const s = String(dateStr).replace(/\D/g, '');
  if (s.length < 8) return dateStr;
  return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
}

function normalizeTime(timeStr) {
  // ADIF time is HHMMSS (UTC)
  if (!timeStr) return '';
  const s = String(timeStr).replace(/\D/g, '');
  if (s.length < 4) return timeStr;
  const seconds = s.length >= 6 ? s.slice(4,6) : '00';
  return `${s.slice(0,2)}:${s.slice(2,4)}:${seconds}`;
}

function normalizeFreq(freqStr) {
  if (!freqStr) return '';
  // Convert MHz (decimal string) to a readable band label too
  const f = parseFloat(freqStr);
  if (isNaN(f)) return freqStr;
  if (f >= 1.0 && f < 1.9) return `${f.toFixed(3)} MHz`;
  if (f >= 3.5 && f < 4.0) return `${f.toFixed(3)} MHz`;
  if (f >= 7.0 && f < 7.3) return `${f.toFixed(3)} MHz`;
  if (f >= 14.0 && f < 14.5) return `${f.toFixed(3)} MHz`;
  if (f >= 21.0 && f < 21.5) return `${f.toFixed(3)} MHz`;
  if (f >= 28.0 && f < 29.7) return `${f.toFixed(3)} MHz`;
  return freqStr;
}

/**
 * Parse ADIF text into QSO records.
 * Returns { header, qsos } where qsos is an array of normalized records.
 */
function parseADIF(text) {
  if (!text || typeof text !== 'string') {
    return { header: {}, qsos: [] };
  }

  const header = {};
  const qsos = [];

  // Split into records by <EOR>
  let hadHeader = false;
  const parts = text.split(/<eor>\s*/gi);

  for (const chunk of parts) {
    // Collect all fields in this chunk
    const fields = {};
    let m;
    const re = new RegExp(FIELD_RE.source, 'gi');
    let firstTag = null;
    while ((m = re.exec(chunk)) !== null) {
      const tag = m[1].toUpperCase();
      const val = m[4];
      if (firstTag === null) firstTag = tag;
      fields[tag] = String(val).trim();
    }

    if (Object.keys(fields).length === 0) continue;

    // Determine if this is a header record (contains ADIF_VER / PROGRAM / no CALL)
    const isHeader = !fields['CALL'] && !fields['QSO_DATE'];

    if (isHeader) {
      Object.assign(header, fields);
      hadHeader = true;
    } else {
      // It's a QSO record
      const qso = {
        call: (fields['CALL'] || '').toUpperCase(),
        band: (fields['BAND'] || '').toUpperCase(),
        mode: (fields['MODE'] || '').toUpperCase(),
        freq: normalizeFreq(fields['FREQ'] || ''),
        date: normalizeDate(fields['QSO_DATE']),
        time: normalizeTime(fields['TIME_ON'] || fields['TIME'] || ''),
        rst_sent: fields['RST_SENT'] || '',
        rst_rcvd: fields['RST_RCVD'] || '',
        qsl_rcvd: fields['QSL_RCVD'] || '',
        qsl_sent: fields['QSL_SENT'] || '',
        ituz: fields['ITUZ'] || '',
        dxcc: fields['DXCC'] || '',
        country: fields['COUNTRY'] || '',
        state: fields['STATE'] || '',
        grid: fields['GRIDSQUARE'] || '',
        park: fields['POTA_REF'] || fields['SOTA_REF'] || '',
        propmode: fields['PROP_MODE'] || fields['PROPMODE'] || '',
        remark: fields['COMMENT'] || fields['NOTES'] || '',
        station: (fields['STATION_CALLSIGN'] || '').toUpperCase(),
        raw: fields
      };
      qsos.push(qso);
    }
  }

  return { header, qsos };
}

/** Convert a QSO record to a friendly band label like "20m" from freq/band. */
function bandLabel(band) {
  if (!band) return '';
  const b = String(band).toLowerCase().replace('m','');
  const n = parseFloat(b);
  return isNaN(n) ? band : `${band.toUpperCase().replace('M','')}m`;
}

module.exports = { parseADIF, bandLabel };

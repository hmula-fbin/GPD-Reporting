/* Reads a data file into a SheetJS workbook, whether it is a CSV or an Excel file. The data files are
   CSVs; the check is on the content (an Excel file is a zip, starting "PK"), not the name, so an
   Excel file still reads. CSV text is decoded as UTF-8, or as Windows-1252 when it isn't valid UTF-8,
   and numbers and dates in it become real numbers and dates, as they would in Excel. */
window.gpdReadBook = function(buf){
  var b = new Uint8Array(buf), start = 0;
  if (b[0] === 0x50 && b[1] === 0x4B) return XLSX.read(buf, {type:"array", cellDates:true});
  if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) start = 3;          /* skip the UTF-8 byte-order mark */
  var text;
  try{ text = new TextDecoder("utf-8", {fatal:true}).decode(b.subarray(start)); }
  catch(e){ text = new TextDecoder("windows-1252").decode(b); }
  var wb = XLSX.read(text, {type:"string", cellDates:true});
  /* a date written as 2027-01-05 is read as midnight UTC, which is 4 Jan in the Americas: make it that
     calendar day in the viewer's time zone, as a date written 1/5/2027 already is */
  wb.SheetNames.forEach(function(n){
    var ws = wb.Sheets[n];
    Object.keys(ws).forEach(function(a){
      var c = ws[a];
      if (a[0] !== "!" && c && c.v instanceof Date && !c.v.getUTCHours() && !c.v.getUTCMinutes() && !c.v.getUTCSeconds())
        c.v = new Date(c.v.getUTCFullYear(), c.v.getUTCMonth(), c.v.getUTCDate());
    });
  });
  return wb;
};

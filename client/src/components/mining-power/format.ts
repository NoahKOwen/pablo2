/** R5 display-only formatters: never round or compute a financial entitlement. */
export function displayDecimal(value:string|null|undefined,digits=6):string {
  if (value===null || value===undefined || !/^-?\d+(?:\.\d+)?$/.test(value)) return "—";
  const negative=value.startsWith("-");
  const unsigned=negative?value.slice(1):value;
  const [integer,fraction=""]=unsigned.split(".");
  const left=(integer.replace(/^0+(?=\d)/, "")||"0").replace(/\B(?=(\d{3})+(?!\d))/g,",");
  const precision=Math.max(0,Math.min(18,Math.floor(digits)));
  const show=fraction.slice(0,precision).replace(/0+$/,"");
  if (precision>0 && !show && /^0+$/.test(integer) && /[1-9]/.test(fraction)) {
    return `${negative?"-":""}<0.${"0".repeat(Math.max(0,precision-1))}1`;
  }
  return `${negative?"-":""}${left}${show?`.${show}`:""}`;
}
export function utcDate(value:string|null|undefined):string {
  if (!value) return "—";
  const d=new Date(value);
  return Number.isNaN(d.getTime())?"—":d.toLocaleString("en-GB",{
    timeZone:"UTC",year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false,
  })+" UTC";
}
export function pctRatio(value:string|null|undefined):string {
  if (!value||!/^(?:\d+)(?:\.\d+)?$/.test(value)) return "—";
  return `${(Math.min(1,Math.max(0,Number(value)))*100).toFixed(2)}%`;
}
export function safeSharePercent(userMp:string,networkMp:string):string|null {
  if(!/^(?:\d+)(?:\.\d+)?$/.test(userMp)||!/^(?:\d+)(?:\.\d+)?$/.test(networkMp)) return null;
  const u=Number(userMp),n=Number(networkMp);
  if(!(n>0)||!Number.isFinite(u)||!Number.isFinite(n)||u<0) return null;
  return `${(100*u/n).toFixed(4)}%`;
}

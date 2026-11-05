import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Copy, Info, LockKeyhole, Wallet } from "lucide-react";
import type { MiningPowerCatalogDTO, MiningPowerQuoteDTO, MiningPowerNetworkDTO } from "@shared/mining-power-view";
import { displayDecimal } from "./format";

const HASH=/^0x[a-fA-F0-9]{64}$/;
async function jsonFrom(res:Response):Promise<MiningPowerQuoteDTO>{return res.json() as Promise<MiningPowerQuoteDTO>;}
export function MiningPowerActivation({catalog,network,onSubmitted}:{catalog:MiningPowerCatalogDTO|null;network:MiningPowerNetworkDTO|null;onSubmitted:()=>void}){
  const {toast}=useToast();
  const [code,setCode]=useState("");
  const [months,setMonths]=useState(12);
  const [hash,setHash]=useState("");
  const [proofUrl,setProofUrl]=useState("");
  const [confirmTerms,setConfirmTerms]=useState(false);
  const [confirmPayment,setConfirmPayment]=useState(false);
  const submitLock=useRef(false);
  useEffect(()=>{
    if(!catalog)return;
    if(!catalog.packages.some(x=>x.code===code))setCode(catalog.packages.find(p=>p.code==="standard")?.code??catalog.packages[0]?.code??"");
    if(!catalog.durations.some(x=>x.months===months))setMonths(catalog.durations[0]?.months??1);
  },[catalog,code,months]);
  const pkg=catalog?.packages.find(p=>p.code===code);
  const chosenDuration=catalog?.durations.find(d=>d.months===months);
  // Illustrative display ONLY. Authoritative activation MP comes from R2 quote.
  const previewStaticMp=pkg&&chosenDuration
    ? Number(pkg.baseMp)*(1+Number(pkg.packageBoostRate))*Number(chosenDuration.multiplier):null;
  const enabled=!!catalog?.enabled;
  const quote=useQuery<MiningPowerQuoteDTO>({
    queryKey:["r5","quote",code,months,catalog?.protocolVersion],
    queryFn:()=>apiRequest("POST","/api/mining-power/activation/quote",{packageCode:code,durationMonths:months}).then(jsonFrom),
    enabled:enabled&&!!code&&Number.isInteger(months),staleTime:15_000,retry:false,
  });
  const normalizedHash=hash.trim().toLowerCase();
  const lastDay=network?.latestDay;
  const estimatedMp=quote.data?Number(quote.data.staticWeightedMp):previewStaticMp;
  const historicalNewParticipantShare=lastDay&&estimatedMp!==null&&Number.isFinite(estimatedMp)
    ? estimatedMp/(Number(lastDay.qualifiedEffectiveMp)+estimatedMp):null;
  const illustration=lastDay&&historicalNewParticipantShare!==null&&Number.isFinite(historicalNewParticipantShare)
    ? historicalNewParticipantShare*Number(lastDay.reservedEmission):null;
  const [submitted,setSubmitted]=useState(false);
  const request=useMutation({
    mutationFn:async()=>{
      if(!enabled||!quote.data?.paymentAddress||!HASH.test(normalizedHash)||!confirmTerms||!confirmPayment) throw new Error("Check the quotation, transaction hash and both confirmations");
      if(!window.crypto?.randomUUID) throw new Error("Secure browser context is required for safe payment submission");
      // Stable ID for retries, including reloads within the same browser session.
      const idKey=`xnrt:r5:activation:${code}:${months}:${normalizedHash}`;
      let activationRequestId=window.sessionStorage.getItem(idKey);
      if(!activationRequestId){activationRequestId=window.crypto.randomUUID();window.sessionStorage.setItem(idKey,activationRequestId);}
      const res=await apiRequest("POST","/api/mining-power/activations",{
        activationRequestId,packageCode:code,durationMonths:months,
        transactionHash:normalizedHash,...(proofUrl.trim()?{proofImageUrl:proofUrl.trim()}:{}),
      });
      return res.json();
    },
    onSuccess:()=>{
      setSubmitted(true);
      queryClient.invalidateQueries({queryKey:["r5"]});
      queryClient.invalidateQueries({queryKey:["/api/mining-power/activations"]});
      toast({title:"Payment report submitted",description:"Your activation is pending verification; no reward has been credited."});
      onSubmitted();
    },
    onError:(e:Error)=>toast({title:"Submission not completed",description:e.message,variant:"destructive"}),
    onSettled:()=>{submitLock.current=false;},
  });
  const canSend=enabled&&!!quote.data?.paymentAddress&&!quote.isFetching&&!request.isPending&&HASH.test(normalizedHash)&&confirmTerms&&confirmPayment&&!submitted;
  return <div className="space-y-5" data-testid="mining-power-activation-wizard">
    <ol className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card/50 p-3 text-xs font-medium sm:grid-cols-4" aria-label="Mining Power activation steps" data-testid="mining-activation-steps">
      <li className="rounded-md bg-primary/10 p-2 text-foreground"><span className="text-primary">1.</span> Package</li>
      <li className="rounded-md bg-primary/10 p-2 text-foreground"><span className="text-primary">2.</span> Duration</li>
      <li className="rounded-md bg-muted p-2 text-foreground/80"><span className="text-primary">3.</span> Review quote</li>
      <li className="rounded-md bg-muted p-2 text-foreground/80" aria-disabled={!enabled}><span className="text-primary">4.</span> {enabled ? "Report payment" : "Payment unavailable"}</li>
    </ol>
    <Card><CardHeader><CardTitle>1. Choose Mining Power package</CardTitle>
      <CardDescription className="text-foreground/75">One-time activation value and Base MP. Package and duration define reward weighting, not a promised return.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {!catalog?.packages.length?<p className="text-sm text-foreground/75">No package catalog is configured.</p>:
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label="Mining Power packages">
          {catalog.packages.map(p=><button key={p.code} type="button" aria-pressed={code===p.code}
            onClick={()=>{setCode(p.code);setSubmitted(false);}}
            className={`rounded-xl border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${code===p.code?"border-primary bg-primary/10":"border-border bg-card hover:border-primary/40"}`}
            data-testid={`mining-package-${p.code}`}>
            <div className="flex flex-wrap items-center justify-between gap-1"><strong>{p.name}</strong>{p.code==="standard"&&<Badge variant="secondary">Popular</Badge>}</div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{displayDecimal(p.activationAmountUsdt,2)} <span className="text-sm">USDT</span></p>
            <p className="mt-1 text-xs text-foreground/75">{displayDecimal(p.baseMp)} Base MP · +{(Number(p.packageBoostRate)*100).toFixed(0)}% package boost</p>
          </button>)}
        </div>}
        {pkg&&chosenDuration&&!enabled&&previewStaticMp!==null&&Number.isFinite(previewStaticMp)&&
          <p className="rounded-lg bg-muted p-3 text-xs text-foreground/75">Draft preview: approximately {previewStaticMp.toLocaleString("en-US",{maximumFractionDigits:6})} static weighted MP based on configured package/duration. Not an activation quote or reward entitlement.</p>}
        <div className="space-y-2"><Label htmlFor="mining-duration">2. Choose independent activation duration</Label>
          <select id="mining-duration" value={months} onChange={e=>{setMonths(Number(e.target.value));setSubmitted(false);}}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:max-w-xs">
            {(catalog?.durations??[]).map(d=><option key={d.months} value={d.months}>{d.months} {d.months===1?"month":"months"} · {d.multiplier}× duration multiplier</option>)}
          </select>
        </div>
      </CardContent></Card>
    <Card><CardHeader><CardTitle>3. Review your activation quote</CardTitle>
      <CardDescription className="text-foreground/75">The platform calculates an authoritative quote when activations are available. Future network emissions and dynamic boosts are not included.</CardDescription></CardHeader><CardContent>
      {!enabled?<div className="flex items-start gap-2 rounded-lg bg-muted p-4 text-sm" role="status"><LockKeyhole className="h-5 w-5 shrink-0"/><p>Preview only. Mining Power payment and activation are unavailable until the protocol and launch policy are approved. Do not send USDT.</p></div>:
       quote.isLoading||quote.isFetching?<p className="text-sm text-foreground/75">Preparing authoritative quote…</p>:
       quote.isError?<p className="text-sm text-destructive" role="alert">Unable to obtain a quote. No payment should be made. Retry by changing selection or refreshing.</p>:
       quote.data?<div className="space-y-4">
         <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
           <div><p className="text-foreground/75">USDT amount</p><strong>{displayDecimal(quote.data.activationAmountUsdt,2)}</strong></div>
           <div><p className="text-foreground/75">Base MP</p><strong>{displayDecimal(quote.data.baseMp)}</strong></div>
           <div><p className="text-foreground/75">Duration multiplier</p><strong>{quote.data.durationMultiplier}×</strong></div>
           <div><p className="text-foreground/75">Static weighted MP</p><strong>{displayDecimal(quote.data.staticWeightedMp)} MP</strong></div>
         </div>
         {quote.data.paymentAddress?<div className="rounded-lg border border-border p-3 space-y-2">
           <p className="flex items-center gap-2 text-sm font-medium"><Wallet className="h-4 w-4"/> Payment instructions</p>
           <p className="text-xs text-foreground/75">Send exactly {displayDecimal(quote.data.activationAmountUsdt,2)} USDT on {quote.data.paymentNetwork} to this quoted recipient. Verify the asset, network and address before sending.</p>
           <code className="block break-all rounded bg-muted p-2 text-xs" data-testid="mining-payment-address">{quote.data.paymentAddress}</code>
           <Button size="sm" variant="outline" onClick={async()=>{
             try { if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
               await navigator.clipboard.writeText(quote.data!.paymentAddress!);
               toast({title:"Address copied"});
             } catch { toast({title:"Copy unavailable",description:"Select and copy the displayed address manually.",variant:"destructive"}); }
           }}><Copy className="mr-1 h-4 w-4"/> Copy address</Button>
         </div>:<p role="alert" className="text-sm text-destructive">Payment address is not configured. Submission is disabled.</p>}
       </div>:<p className="text-sm text-foreground/75">Choose a package and duration to request a quote.</p>}
    </CardContent></Card>
    {enabled ? <Card data-testid="mining-activation-payment"><CardHeader><CardTitle>4. Report your completed payment</CardTitle>
      <CardDescription className="text-foreground/75">Only submit a transaction after paying the exact quoted asset/network. Submission does not activate mining or guarantee approval.</CardDescription></CardHeader><CardContent className="space-y-4">
        <div className="space-y-2"><Label htmlFor="mining-transaction-hash">BSC transaction hash</Label>
          <Input id="mining-transaction-hash" placeholder="0x + 64 hexadecimal characters" autoComplete="off" spellCheck={false}
            value={hash} onChange={e=>{setHash(e.target.value);setSubmitted(false);}} maxLength={66} aria-invalid={hash.length>0&&!HASH.test(normalizedHash)} data-testid="mining-transaction-hash"/>
          {hash.length>0&&!HASH.test(normalizedHash)&&<p className="text-xs text-destructive">Enter a valid 0x-prefixed, 64-hex-character transaction hash.</p>}
        </div>
        <div className="space-y-2"><Label htmlFor="mining-payment-proof">Optional hosted proof image URL</Label>
          <Input id="mining-payment-proof" placeholder="https://…" value={proofUrl} onChange={e=>setProofUrl(e.target.value)} maxLength={2048}/>
        </div>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={confirmPayment} onChange={e=>setConfirmPayment(e.target.checked)}/>
          <span>I have already sent the exact quoted USDT amount on the correct BSC network and verified the recipient address.</span></label>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={confirmTerms} onChange={e=>setConfirmTerms(e.target.checked)}/>
          <span>I understand activation becomes non-refundable once approved, future network-share rewards are variable and not guaranteed, and emission/payout processing may be paused.</span></label>
        {submitted?<p className="flex items-center gap-2 text-sm text-emerald-600" role="status"><CheckCircle2 className="h-4 w-4"/> Payment report submitted. Track approval under My Activations.</p>:null}
        <Button disabled={!canSend} onClick={()=>{if(submitLock.current)return;submitLock.current=true;request.mutate();}} data-testid="mining-submit-activation">
          {request.isPending?"Submitting…":"Submit for payment verification"}
        </Button>
        <p className="flex items-start gap-2 text-xs text-foreground/75"><Info className="h-4 w-4 shrink-0"/> Never send funds while the protocol is in draft, while the quote is unavailable, or without confirming the network and recipient.</p>
      </CardContent></Card> : null}
    <Card><CardHeader><CardTitle>Illustrative network-share calculator</CardTitle>
      <CardDescription className="text-foreground/75">Uses the most recent recorded R3 day as a historical reference—not a reward forecast, ROI, APY or financial commitment.</CardDescription></CardHeader>
      <CardContent className="space-y-2 text-sm">
        {lastDay&&illustration!==null&&Number.isFinite(illustration)&&historicalNewParticipantShare!==null?
         <><p>Hypothetical added participant share: <strong>{(historicalNewParticipantShare*100).toFixed(4)}%</strong></p>
           <p>Hypothetical share of that recorded day's emission: <strong>{illustration.toFixed(6)} XNRT</strong></p>
           <p className="text-xs text-foreground/75">Hypothetical calculation: selected static MP / (historical network Effective MP + selected MP) × historical reserved emission. It is NOT today's expected earnings, does not account for future dynamic boosts, and cannot be used to infer guaranteed rewards.</p></>:
         <p className="text-foreground/75">No finalized R3 reference day exists, so reward illustrations are unavailable. A package quote only determines static MP.</p>}
      </CardContent></Card>
  </div>;
}

/** Mining Power v1 user experience — separate from legacy /mining XP sessions. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { Activity, ArrowLeft, Coins, ShieldAlert, Zap } from "lucide-react";
import type { MiningPowerCatalogDTO, MiningPowerNetworkDTO, MiningPowerOverviewDTO } from "@shared/mining-power-view";
import { MiningPowerActivation } from "@/components/mining-power/activation";
import { MiningPowerActivations, MiningPowerDashboard, MiningPowerNetwork, MiningPowerRewards } from "@/components/mining-power/sections";

async function getJson<T>(path:string):Promise<T> {const res=await apiRequest("GET",path);return res.json() as Promise<T>;}
export default function MiningPowerPage(){
  const [tab,setTab]=useState("overview");
  const catalog=useQuery<MiningPowerCatalogDTO>({
    queryKey:["r5","catalog"],queryFn:()=>getJson("/api/mining-power/catalog"),staleTime:60_000,
  });
  const network=useQuery<MiningPowerNetworkDTO>({
    queryKey:["r5","network"],queryFn:()=>getJson("/api/mining-power/network"),staleTime:60_000,
  });
  const overview=useQuery<MiningPowerOverviewDTO>({
    queryKey:["r5","overview"],queryFn:()=>getJson("/api/mining-power/me/overview"),staleTime:20_000,
  });
  return <div className="mx-auto w-full max-w-7xl space-y-6 pb-12" data-testid="mining-power-page">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="space-y-2">
        <Button variant="outline" size="sm" asChild><Link href="/mining"><ArrowLeft className="mr-1 h-4 w-4"/> Back to Free XP Mining</Link></Button>
        <div className="flex flex-wrap items-center gap-3"><div className="rounded-xl bg-primary/10 p-3"><Zap className="h-6 w-6 text-primary"/></div>
          <div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Mining Power Network</h1>
            <p className="text-sm text-foreground/75">Activation-based virtual Mining Power · Variable network-share rewards</p></div>
        </div>
      </div>
      <Badge variant={catalog.data?.enabled?"default":"secondary"} data-testid="mining-power-protocol-status">
        {catalog.isLoading?"Checking protocol…":catalog.isError?"Protocol unavailable":catalog.data?.enabled?"Activation available":"Draft / Preview only"}
      </Badge>
    </div>
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm" role="note">
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500"/>
      <p><strong>Important:</strong> Mining Power represents virtual network reward weight, not physical cryptocurrency hash rate.
        There is no fixed APY, guaranteed daily reward, guaranteed ROI or investment repayment. The mining pool, settlement precision and emission policy remain provisional until formally approved.</p>
    </div>
    {catalog.isError&&<div className="rounded-lg border border-destructive p-4 text-sm text-destructive" role="alert">The Mining Power catalog could not be loaded. Activation is unavailable. Refresh to retry.</div>}
    {overview.isError&&<div className="rounded-lg border border-destructive p-4 text-sm text-destructive" role="alert">Personal mining data could not be loaded. Try refreshing.</div>}
    <Tabs value={tab} onValueChange={setTab} className="space-y-5">
      <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-muted/70 p-1" aria-label="Mining Power sections">
        <TabsTrigger value="overview" data-testid="r5-tab-overview"><Activity className="mr-1 h-4 w-4"/> Overview</TabsTrigger>
        <TabsTrigger value="activate" data-testid="r5-tab-activate"><Zap className="mr-1 h-4 w-4"/> Packages & Activation</TabsTrigger>
        <TabsTrigger value="activations" data-testid="r5-tab-activations">My Activations</TabsTrigger>
        <TabsTrigger value="rewards" data-testid="r5-tab-rewards"><Coins className="mr-1 h-4 w-4"/> Reward History</TabsTrigger>
        <TabsTrigger value="network" data-testid="r5-tab-network">Network</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="space-y-5"><MiningPowerDashboard overview={overview.data??null} network={network.data??null}/>
        <p className="text-xs text-foreground/75">Your Mining Power rewards are based on recorded allocations and credited ledger entries. Free XP Mining is a separate activity.</p>
      </TabsContent>
      <TabsContent value="activate"><MiningPowerActivation catalog={catalog.data??null} network={network.data??null} onSubmitted={()=>setTab("activations")}/></TabsContent>
      <TabsContent value="activations"><MiningPowerActivations onExplorePackages={()=>setTab("activate")}/></TabsContent>
      <TabsContent value="rewards"><MiningPowerRewards/></TabsContent>
      <TabsContent value="network"><MiningPowerNetwork network={network.data??null}/></TabsContent>
    </Tabs>
  </div>;
}

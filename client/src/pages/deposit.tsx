// client/src/pages/deposit.tsx
import { useState, useEffect, type ChangeEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowDownToLine,
  Copy,
  CheckCircle,
  Clock,
  XCircle,
  Info,
  Upload,
  X,
  QrCode,
} from "lucide-react";
import type { Transaction } from "@shared/schema";
import { isUnauthorizedError, handleUnauthorized } from "@/lib/authUtils";
import { LinkWalletCard } from "@/components/link-wallet-card";
import { ReportMissingDeposit } from "@/components/report-missing-deposit";
import QRCode from "qrcode";
import { nf } from "@/lib/number";

const COMPANY_WALLET = "0x715C32deC9534d2fB34e0B567288AF8d895efB59";
const USDT_TO_XNRT_RATE = 100;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

type DepositAddressResponse = {
  address: string;
  network?: string;
  token?: string;
  instructions?: string[];
};

export default function Deposit() {
  const { toast } = useToast();
  const [usdtAmount, setUsdtAmount] = useState("");
  const [transactionHash, setTransactionHash] = useState("");
  const [proofImageUrl, setProofImageUrl] = useState("");
  const [proofImageFile, setProofImageFile] = useState<File | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [showQR, setShowQR] = useState(false);

  const { data: deposits } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions/deposits"],
  });

  const { data: depositAddress, isLoading: isLoadingAddress } = useQuery<
    DepositAddressResponse
  >({
    queryKey: ["/api/wallet/deposit-address"],
  });

  // Generate QR code when deposit address is loaded
  useEffect(() => {
    if (depositAddress?.address) {
      QRCode.toDataURL(depositAddress.address, {
        width: 256,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      })
        .then((url) => setQrCodeUrl(url))
        .catch((err) => console.error("QR Code generation failed:", err));
    }
  }, [depositAddress?.address]);

  // Manual deposit submission → /api/wallet/report-deposit
  const depositMutation = useMutation({
    mutationFn: async (data: {
      amount: string;
      transactionHash?: string;
      description?: string;
      proofImageUrl?: string;
    }) => {
      return await apiRequest("POST", "/api/wallet/report-deposit", data);
    },
    onSuccess: () => {
      toast({
        title: "Deposit Report Submitted",
        description:
          "Your deposit report has been submitted. We'll review and credit it if valid.",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/transactions/deposits"],
      });
      setUsdtAmount("");
      setTransactionHash("");
      setProofImageUrl("");
      setProofImageFile(null);
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        handleUnauthorized(toast);
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to submit deposit",
        variant: "destructive",
      });
    },
  });

  const copyWallet = (address: string) => {
    if (!navigator.clipboard) {
      toast({
        title: "Copy Failed",
        description: "Clipboard not available. Please copy manually.",
        variant: "destructive",
      });
      return;
    }

    navigator.clipboard
      .writeText(address)
      .then(() => {
        toast({
          title: "Copied!",
          description: "Wallet address copied to clipboard",
        });
      })
      .catch(() => {
        toast({
          title: "Copy Failed",
          description: "Unable to copy to clipboard. Please copy manually.",
          variant: "destructive",
        });
      });
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid File Type",
        description: "Please upload an image file (PNG, JPEG, or JPG)",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "File Too Large",
        description: "Image size must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setProofImageUrl(base64String);
      setProofImageFile(file);
      toast({
        title: "Image Uploaded",
        description: "Proof of payment image ready to submit",
      });
    };
    reader.onerror = () => {
      toast({
        title: "Upload Failed",
        description: "Failed to process the image. Please try again.",
        variant: "destructive",
      });
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setProofImageUrl("");
    setProofImageFile(null);
  };

  const handleSubmit = () => {
    if (!usdtAmount) {
      toast({
        title: "Missing Amount",
        description: "Please enter the USDT amount you deposited",
        variant: "destructive",
      });
      return;
    }

    const amount = parseFloat(usdtAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid USDT amount",
        variant: "destructive",
      });
      return;
    }

    const trimmedHash = transactionHash.trim();

    depositMutation.mutate({
      amount: usdtAmount,
      ...(trimmedHash && { transactionHash: trimmedHash }), // optional
      description: "Manual deposit report from Deposit page",
      ...(proofImageUrl && { proofImageUrl }),
    });
  };

  const parsedAmount = parseFloat(usdtAmount || "0");
  const xnrtAmount =
    !Number.isNaN(parsedAmount) && parsedAmount > 0
      ? parsedAmount * USDT_TO_XNRT_RATE
      : 0;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle className="h-5 w-5 text-chart-2" />;
      case "pending":
        return <Clock className="h-5 w-5 text-chart-3" />;
      case "rejected":
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-chart-2/20 text-chart-2 border-chart-2/30";
      case "pending":
        return "bg-chart-3/20 text-chart-3 border-chart-3/30";
      case "rejected":
        return "bg-destructive/20 text-destructive border-destructive/30";
      default:
        return "";
    }
  };

  const sortedDeposits: Transaction[] =
    deposits?.slice().sort((a: Transaction, b: Transaction) => {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return db - da; // newest first
    }) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-serif">Deposit</h1>
        <p className="text-muted-foreground">
          Deposit USDT to receive XNRT tokens
        </p>
      </div>

      <LinkWalletCard />

      <div className="grid gap-6 md:grid-cols-2">
        {/* LEFT: Instructions + personal deposit address */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle>Deposit Instructions</CardTitle>
            <CardDescription>Follow these steps to deposit</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
                  1
                </div>
                <div>
                  <p className="font-semibold">
                    Send USDT to Your Deposit Address
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Use any wallet or exchange via BEP20 network
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
                  2
                </div>
                <div>
                  <p className="font-semibold">Wait for Confirmations</p>
                  <p className="text-sm text-muted-foreground">
                    12 BSC confirmations (~36 seconds)
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
                  3
                </div>
                <div>
                  <p className="font-semibold">Auto-Credit XNRT</p>
                  <p className="text-sm text-muted-foreground">
                    Automatically credited to your balance
                  </p>
                </div>
              </div>

              <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  ✨ <strong>Easy Deposits:</strong> Send USDT directly from
                  Binance, OKX, or any wallet to your personal deposit address
                  below. No wallet linking, gas fees, or blockchain interaction
                  required!
                </p>
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  💡 <strong>Auto-Detection:</strong> Your deposits are
                  automatically detected and credited after 12 confirmations.
                </p>
              </div>
            </div>

            <div className="space-y-2 rounded-md border border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Info className="h-4 w-4 text-primary" />
                <span>Your Personal Deposit Address</span>
              </div>
              {isLoadingAddress ? (
                <div className="h-10 animate-pulse rounded-md bg-muted/50" />
              ) : depositAddress?.address ? (
                <>
                  <div className="flex items-center gap-2">
                    <Input
                      value={depositAddress.address}
                      readOnly
                      className="bg-background font-mono text-xs"
                      data-testid="input-deposit-address"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => copyWallet(depositAddress.address)}
                      data-testid="button-copy-deposit-address"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => setShowQR((prev) => !prev)}
                      data-testid="button-toggle-qr"
                    >
                      <QrCode className="h-4 w-4" />
                    </Button>
                  </div>

                  {showQR && qrCodeUrl && (
                    <div className="flex justify-center rounded-md bg-white p-4">
                      <img
                        src={qrCodeUrl}
                        alt="Deposit Address QR Code"
                        className="h-48 w-48"
                        data-testid="img-qr-code"
                      />
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Network:{" "}
                    {depositAddress.network ||
                      "BEP20 (Binance Smart Chain)"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Token: {depositAddress.token || "USDT"}
                  </p>
                  <p className="text-xs font-medium text-primary">
                    ⚡ This address is unique to you - deposits are
                    auto-credited!
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Failed to load deposit address
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* RIGHT: Manual / troubleshooting submission */}
        <Card className="border-primary/20 bg-gradient-to-br from-card to-primary/5">
          <CardHeader>
            <CardTitle>Manual Deposit Submission</CardTitle>
            <CardDescription>
              Optional: For deposits from unlinked wallets or troubleshooting
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Global XNRT-USDT wallet address */}
            <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  XNRT-USDT Wallet Address
                </span>
                <Badge variant="outline" className="text-[10px]">
                  BEP20 • BSC
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={COMPANY_WALLET}
                  readOnly
                  className="bg-background font-mono text-xs"
                  data-testid="input-company-wallet"
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => copyWallet(COMPANY_WALLET)}
                  data-testid="button-copy-company-wallet"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* USDT amount */}
            <div>
              <Label htmlFor="usdtAmount">USDT Amount</Label>
              <Input
                id="usdtAmount"
                type="number"
                placeholder="Enter USDT amount"
                value={usdtAmount}
                onChange={(e) => setUsdtAmount(e.target.value)}
                data-testid="input-usdt-amount"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Rate: 1 USDT = {USDT_TO_XNRT_RATE.toLocaleString()} XNRT
              </p>
            </div>

            {xnrtAmount > 0 && (
              <div className="rounded-md bg-muted/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    You will receive:
                  </span>
                  <span
                    className="text-2xl font-bold text-primary"
                    data-testid="text-xnrt-amount"
                  >
                    {nf(xnrtAmount)} XNRT
                  </span>
                </div>
              </div>
            )}

            {/* Tx hash (optional) */}
            <div>
              <Label htmlFor="txHash">Transaction Hash (Optional)</Label>
              <Textarea
                id="txHash"
                placeholder="Paste transaction hash from your wallet (optional)"
                value={transactionHash}
                onChange={(e) => setTransactionHash(e.target.value)}
                className="font-mono text-sm"
                data-testid="input-tx-hash"
              />
            </div>

            {/* Proof screenshot */}
            <div>
              <Label htmlFor="proofImage">Proof of Payment (Optional)</Label>
              <div className="space-y-3">
                {!proofImageUrl ? (
                  <div className="flex items-center gap-2">
                    <Input
                      id="proofImage"
                      type="file"
                      accept="image/png,image/jpeg,image/jpg"
                      onChange={handleImageUpload}
                      className="hidden"
                      data-testid="input-proof-image"
                    />
                    <label htmlFor="proofImage" className="flex-1">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() =>
                          document.getElementById("proofImage")?.click()
                        }
                        data-testid="button-upload-proof"
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Upload Screenshot
                      </Button>
                    </label>
                  </div>
                ) : (
                  <div className="relative rounded-lg border-2 border-dashed border-primary/30 bg-muted/30 p-3">
                    <div className="flex items-start gap-3">
                      <img
                        src={proofImageUrl}
                        alt="Proof of payment"
                        className="h-24 w-24 rounded-md border border-border object-cover"
                        data-testid="img-proof-preview"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {proofImageFile?.name || "Proof image"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {proofImageFile
                            ? `${(proofImageFile.size / 1024).toFixed(1)} KB`
                            : "Ready to submit"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={clearImage}
                        className="flex-shrink-0"
                        data-testid="button-clear-proof"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Upload a screenshot of your transaction (PNG, JPEG, JPG • Max
                  5MB)
                </p>
              </div>
            </div>

            <Button
              className="w-full"
              size="lg"
              disabled={
                depositMutation.isPending ||
                Number.isNaN(parsedAmount) ||
                parsedAmount <= 0
              }
              onClick={handleSubmit}
              data-testid="button-submit-deposit"
            >
              <ArrowDownToLine className="mr-2 h-5 w-5" />
              {depositMutation.isPending ? "Submitting..." : "Submit Deposit"}
            </Button>

            <div className="border-border border-t pt-3">
              <ReportMissingDeposit />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Deposit history */}
      <Card>
        <CardHeader>
          <CardTitle>Deposit History</CardTitle>
          <CardDescription>Your deposit transactions</CardDescription>
        </CardHeader>
        <CardContent>
          {sortedDeposits.length === 0 ? (
            <div className="py-12 text-center">
              <ArrowDownToLine className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
              <p className="text-muted-foreground">No deposits yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedDeposits.map((deposit) => {
                const usdt = parseFloat(deposit.usdtAmount || "0");
                const xnrt = parseFloat(deposit.amount || "0");

                return (
                  <div
                    key={deposit.id}
                    className="hover-elevate flex items-center justify-between rounded-md border border-border p-4"
                    data-testid={`deposit-${deposit.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/20">
                        <ArrowDownToLine className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">
                          {usdt.toLocaleString()} USDT →{" "}
                          {xnrt.toLocaleString()} XNRT
                        </p>
                        <p className="font-mono text-sm text-muted-foreground">
                          {deposit.transactionHash
                            ? `${deposit.transactionHash.substring(0, 16)}...`
                            : "No hash"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {deposit.createdAt
                            ? new Date(deposit.createdAt).toLocaleString()
                            : "N/A"}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2 text-right">
                      <Badge
                        className={getStatusColor(deposit.status)}
                        variant="outline"
                      >
                        {getStatusIcon(deposit.status)}
                        <span className="ml-2 capitalize">
                          {deposit.status}
                        </span>
                      </Badge>
                      {deposit.adminNotes && deposit.status === "rejected" && (
                        <p className="text-xs text-destructive">
                          {deposit.adminNotes}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

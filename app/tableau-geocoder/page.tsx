'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Download, Upload, Play, Square } from 'lucide-react';
import { toast } from 'sonner';

const MAX_ROWS = 5000;
const GEOCODE_CHUNK_SIZE = 20;

type DataRow = Record<string, string | number | undefined>;

export default function TableauGeocoderPage() {
    const [data, setData] = useState<DataRow[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [addressColumn, setAddressColumn] = useState<string>('');
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [progress, setProgress] = useState(0);
    const [encoding, setEncoding] = useState('EUC-KR');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        const isCsv = file.name.toLowerCase().endsWith('.csv');

        reader.onload = async (evt) => {
            const XLSX = await import('xlsx');
            const bstr = evt.target?.result;
            let wb;

            if (isCsv && typeof bstr === 'string') {
                wb = XLSX.read(bstr, { type: 'string' });
            } else {
                wb = XLSX.read(bstr, { type: 'binary' });
            }

            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 });

            if (jsonData.length > 0) {
                const fileHeaders = (jsonData[0] as unknown[]).map(String);
                let rows = jsonData.slice(1).map((row: unknown) => {
                    const rowData: DataRow = {};
                    const rowArr = row as unknown[];
                    fileHeaders.forEach((header, index) => {
                        rowData[header] = rowArr[index] as string | number | undefined;
                    });
                    return rowData;
                });

                if (rows.length > MAX_ROWS) {
                    toast.warning(`최대 ${MAX_ROWS}행까지 처리 가능합니다. ${rows.length}행 중 ${MAX_ROWS}행만 로드합니다.`);
                    rows = rows.slice(0, MAX_ROWS);
                }

                setHeaders(fileHeaders);
                setData(rows);

                const likelyAddress = fileHeaders.find(h => h.toLowerCase().includes('address') || h.toLowerCase().includes('주소'));
                if (likelyAddress) {
                    setAddressColumn(likelyAddress);
                } else if (fileHeaders.length > 0) {
                    setAddressColumn(fileHeaders[0]);
                }
            }
        };

        if (isCsv) {
            reader.readAsText(file, encoding);
        } else {
            reader.readAsBinaryString(file);
        }
    };

    const handleCancel = () => {
        abortRef.current?.abort();
    };

    const handleGeocode = async () => {
        if (!addressColumn) {
            toast.error('주소 컬럼을 선택해주세요');
            return;
        }

        const controller = new AbortController();
        abortRef.current = controller;
        setIsGeocoding(true);
        setProgress(0);

        const newData = data.map(row => ({ ...row }));
        let completed = 0;
        let cancelled = false;

        // 청크 단위 병렬 처리
        for (let i = 0; i < newData.length; i += GEOCODE_CHUNK_SIZE) {
            if (controller.signal.aborted) {
                cancelled = true;
                break;
            }

            const chunk = newData.slice(i, i + GEOCODE_CHUNK_SIZE);
            const results = await Promise.allSettled(
                chunk.map(async (row, j) => {
                    const address = row[addressColumn];
                    if (!address) return;

                    const response = await fetch('/api/geocode', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ address }),
                        signal: controller.signal,
                    });

                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const result = await response.json();

                    if (result.x != null && result.y != null) {
                        newData[i + j]['Latitude'] = result.y;
                        newData[i + j]['Longitude'] = result.x;
                    }
                })
            );

            // 취소 확인
            if (controller.signal.aborted) {
                cancelled = true;
                break;
            }

            completed += chunk.length;
            setProgress(Math.round((completed / newData.length) * 100));
        }

        setData(newData);
        setIsGeocoding(false);
        abortRef.current = null;

        if (cancelled) {
            toast.info(`${completed}/${newData.length}건 처리 후 취소됨`);
        } else {
            toast.success('지오코딩 완료!');
        }
    };

    const handleDownload = async () => {
        const XLSX = await import('xlsx');
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Geocoded Data');
        XLSX.writeFile(wb, 'geocoded_data.xlsx');
    };

    return (
        <div className="container mx-auto py-10 space-y-8">
            <div className="flex flex-col space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Tableau Geocoder</h1>
                <p className="text-muted-foreground">
                    Upload a CSV/Excel file with addresses to generate Latitude and Longitude for Tableau.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>1. Upload Data</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-[180px]">
                            <Select value={encoding} onValueChange={setEncoding}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select Encoding" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="UTF-8">UTF-8</SelectItem>
                                    <SelectItem value="EUC-KR">EUC-KR (Korean)</SelectItem>
                                    <SelectItem value="CP949">CP949 (Korean)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Input
                            type="file"
                            accept=".csv, .xlsx, .xls"
                            onChange={handleFileUpload}
                            ref={fileInputRef}
                            className="max-w-md"
                        />
                        <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                            <Upload className="mr-2 h-4 w-4" />
                            Select File
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        * If Korean characters appear broken, try selecting <strong>EUC-KR</strong> or <strong>CP949</strong> before uploading.
                        (Max {MAX_ROWS.toLocaleString()} rows)
                    </p>
                </CardContent>
            </Card>

            {data.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>2. Configure & Run</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-end gap-4">
                            <div className="space-y-2 w-full max-w-xs">
                                <label className="text-sm font-medium">Address Column</label>
                                <Select value={addressColumn} onValueChange={setAddressColumn}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select column" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {headers.map((header) => (
                                            <SelectItem key={header} value={header}>
                                                {header}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            {isGeocoding ? (
                                <Button onClick={handleCancel} variant="destructive">
                                    <Square className="mr-2 h-4 w-4" /> Cancel
                                </Button>
                            ) : (
                                <Button onClick={handleGeocode} disabled={isGeocoding}>
                                    <Play className="mr-2 h-4 w-4" /> Start Geocoding
                                </Button>
                            )}
                        </div>

                        {isGeocoding && <Progress value={progress} className="w-full" />}
                    </CardContent>
                </Card>
            )}

            {data.length > 0 && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>3. Preview & Download</CardTitle>
                        <Button onClick={handleDownload} variant="default">
                            <Download className="mr-2 h-4 w-4" /> Download Result
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border max-h-[500px] overflow-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {headers.map((header) => (
                                            <TableHead key={header}>{header}</TableHead>
                                        ))}
                                        <TableHead className="text-right">Latitude</TableHead>
                                        <TableHead className="text-right">Longitude</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.slice(0, 10).map((row, i) => (
                                        <TableRow key={i}>
                                            {headers.map((header) => (
                                                <TableCell key={`${i}-${header}`}>
                                                    {row[header] as string}
                                                </TableCell>
                                            ))}
                                            <TableCell className="text-right font-mono">
                                                {(row.Latitude as string) || '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-mono">
                                                {(row.Longitude as string) || '-'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2">
                            Showing first 10 rows of {data.length} total rows.
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

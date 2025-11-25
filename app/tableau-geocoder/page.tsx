'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
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
import { Download, Upload, MapPin, Play } from 'lucide-react';
import { toast } from 'sonner';

export default function TableauGeocoderPage() {
    const [data, setData] = useState<any[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [addressColumn, setAddressColumn] = useState<string>('');
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [progress, setProgress] = useState(0);
    const [encoding, setEncoding] = useState('EUC-KR');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        const isCsv = file.name.toLowerCase().endsWith('.csv');

        reader.onload = (evt) => {
            const bstr = evt.target?.result;
            let wb;

            if (isCsv && typeof bstr === 'string') {
                // For CSVs read as text, parse manually or use XLSX.read with type 'string'
                wb = XLSX.read(bstr, { type: 'string' });
            } else {
                // For Excel or binary read
                wb = XLSX.read(bstr, { type: 'binary' });
            }

            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 });

            if (jsonData.length > 0) {
                const headers = jsonData[0] as string[];
                const rows = jsonData.slice(1).map((row: any) => {
                    const rowData: any = {};
                    headers.forEach((header, index) => {
                        rowData[header] = row[index];
                    });
                    return rowData;
                });

                setHeaders(headers);
                setData(rows);

                // Try to auto-detect address column
                const likelyAddress = headers.find(h => h.toLowerCase().includes('address') || h.toLowerCase().includes('주소'));
                if (likelyAddress) {
                    setAddressColumn(likelyAddress);
                } else if (headers.length > 0) {
                    setAddressColumn(headers[0]);
                }
            }
        };

        if (isCsv) {
            reader.readAsText(file, encoding);
        } else {
            reader.readAsBinaryString(file);
        }
    };

    const handleGeocode = async () => {
        if (!addressColumn) {
            toast.error('Please select an address column');
            return;
        }

        setIsGeocoding(true);
        setProgress(0);
        const newData = [...data];
        let completed = 0;

        for (let i = 0; i < newData.length; i++) {
            const address = newData[i][addressColumn];
            if (address) {
                try {
                    const response = await fetch('/api/geocode', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ address }),
                    });
                    const result = await response.json();
                    newData[i]['Latitude'] = result.y;
                    newData[i]['Longitude'] = result.x;
                } catch (error) {
                    console.error('Error geocoding row', i, error);
                }
            }
            completed++;
            setProgress(Math.round((completed / newData.length) * 100));
        }

        setData(newData);
        setIsGeocoding(false);
        toast.success('Geocoding completed!');
    };

    const handleDownload = () => {
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
                            <Button onClick={handleGeocode} disabled={isGeocoding}>
                                {isGeocoding ? (
                                    'Processing...'
                                ) : (
                                    <>
                                        <Play className="mr-2 h-4 w-4" /> Start Geocoding
                                    </>
                                )}
                            </Button>
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
                                                    {row[header]}
                                                </TableCell>
                                            ))}
                                            <TableCell className="text-right font-mono">
                                                {row.Latitude || '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-mono">
                                                {row.Longitude || '-'}
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

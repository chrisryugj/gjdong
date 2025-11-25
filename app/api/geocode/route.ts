import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const { address } = await req.json();

        if (!address) {
            return NextResponse.json(
                { error: 'Address is required' },
                { status: 400 }
            );
        }

        const apiKey = process.env.KAKAO_REST_API_KEY;

        if (!apiKey) {
            return NextResponse.json(
                { error: 'Server configuration error: API Key missing' },
                { status: 500 }
            );
        }

        const response = await fetch(
            `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(
                address
            )}`,
            {
                headers: {
                    Authorization: `KakaoAK ${apiKey}`,
                },
            }
        );

        if (!response.ok) {
            throw new Error(`Kakao API error: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.documents && data.documents.length > 0) {
            const { x, y } = data.documents[0];
            return NextResponse.json({ x, y });
        } else {
            return NextResponse.json({ x: null, y: null });
        }
    } catch (error) {
        console.error('Geocoding error:', error);
        return NextResponse.json(
            { error: 'Failed to geocode address' },
            { status: 500 }
        );
    }
}

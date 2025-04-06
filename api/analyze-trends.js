// 파일 경로: /api/analyze-trends.js
// Vercel Serverless Function으로 동작하는 Node.js 코드입니다.

export default async function handler(req, res) {
    // POST 요청만 처리
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    try {
        // 프론트엔드에서 전송한 키워드 추출
        const { keywords } = req.body;

        if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
            return res.status(400).json({ error: 'Keywords are required and must be a non-empty array.' });
        }

        // --- Vercel 환경 변수에서 API 키 가져오기 ---
        // Vercel 프로젝트 > Settings > Environment Variables 에서 설정해야 합니다.
        const clientId = process.env.NAVER_CLIENT_ID;
        const clientSecret = process.env.NAVER_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            console.error('Naver API environment variables not set.');
            return res.status(500).json({ error: 'Server configuration error: API keys missing.' });
        }
        // --- 환경 변수 가져오기 끝 ---

        const naverApiUrl = 'https://openapi.naver.com/v1/datalab/search';

        // 네이버 API 요청 본문 생성 (프론트엔드에서 받은 키워드 사용)
        const today = new Date();
        const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
        const formatDate = (date) => {
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        };

        const requestBody = {
            startDate: formatDate(oneYearAgo),
            endDate: formatDate(today),
            timeUnit: "month",
            keywordGroups: keywords.map(kw => ({
                groupName: kw,
                keywords: [kw]
            }))
        };

        // 네이버 API 호출 (Node.js 내장 fetch 사용)
        const apiResponse = await fetch(naverApiUrl, {
            method: 'POST',
            headers: {
                'X-Naver-Client-Id': clientId,
                'X-Naver-Client-Secret': clientSecret,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        // 네이버 API 응답 상태 확인
        if (!apiResponse.ok) {
            let errorData;
            try {
                errorData = await apiResponse.json();
                console.error("Naver API Error Response:", errorData);
            } catch (e) {
                console.error("Failed to parse Naver API error response:", apiResponse.statusText);
            }
            // 네이버 오류 메시지가 있으면 포함, 없으면 상태 텍스트 사용
            const errorMessage = errorData?.errorMessage || apiResponse.statusText;
            const errorCode = errorData?.errorCode || apiResponse.status;
            throw new Error(`네이버 API 오류: ${errorMessage} (코드: ${errorCode})`);
        }

        // 네이버 API 성공 응답 파싱
        const data = await apiResponse.json();

        // 성공 응답을 프론트엔드로 전달
        res.status(200).json(data);

    } catch (error) {
        console.error("Error in /api/analyze-trends:", error);
        // 클라이언트에게는 일반적인 오류 메시지 전달
        res.status(500).json({ error: `데이터 분석 중 서버 오류 발생: ${error.message}` });
    }
}

// 파일 경로: /api/analyze-trends.js
// Vercel Serverless Function으로 동작하는 Node.js 코드입니다.

export default async function handler(req, res) {
    // POST 요청만 처리합니다.
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    try {
        // 프론트엔드에서 전송한 데이터 추출 (startDate, endDate 추가)
        const { keywords, timeUnit, startDate, endDate } = req.body;

        // --- 입력값 유효성 검사 ---
        // 키워드 유효성 검사
        if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
            return res.status(400).json({ error: 'Keywords are required and must be a non-empty array.' });
        }

        // 시간 단위 유효성 검사 ('week' 추가)
        const validTimeUnits = ['date', 'week', 'month', 'year'];
        // 유효하지 않은 값이 오면 'date'를 기본값으로 사용합니다.
        const validatedTimeUnit = validTimeUnits.includes(timeUnit) ? timeUnit : 'date';

        // 날짜 유효성 검사 함수
        const isValidDate = (dateString) => {
            // yyyy-mm-dd 형식 확인 (정규식 사용)
            const regex = /^\d{4}-\d{2}-\d{2}$/;
            if (!regex.test(dateString)) return false;
            // 실제 유효한 날짜인지 확인 (Date 객체 활용)
            const date = new Date(dateString);
            // NaN이면 유효하지 않은 날짜입니다.
            if (isNaN(date.getTime())) return false;
            // 네이버 API 최소 날짜 확인 (2016-01-01)
            if (date < new Date("2016-01-01")) return false;
            // 모든 검사를 통과하면 유효한 날짜입니다.
            return true;
        };

        // 시작일, 종료일 유효성 검사
        if (!startDate || !endDate || !isValidDate(startDate) || !isValidDate(endDate)) {
            return res.status(400).json({ error: 'startDate and endDate are required in yyyy-mm-dd format (after 2016-01-01).' });
        }

        // 시작일이 종료일보다 늦지 않은지 확인
        if (new Date(startDate) > new Date(endDate)) {
            return res.status(400).json({ error: 'startDate cannot be after endDate.' });
        }
        // --- 유효성 검사 끝 ---


        // Vercel 환경 변수에서 네이버 API 키 가져오기
        const clientId = process.env.NAVER_CLIENT_ID;
        const clientSecret = process.env.NAVER_CLIENT_SECRET;

        // 환경 변수가 설정되지 않았으면 서버 오류 반환
        if (!clientId || !clientSecret) {
            console.error('Naver API environment variables not set.');
            return res.status(500).json({ error: 'Server configuration error: API keys missing.' });
        }

        // 네이버 데이터랩 API URL
        const naverApiUrl = 'https://openapi.naver.com/v1/datalab/search';

        // 네이버 API 요청 본문 생성 (프론트엔드에서 받은 값 사용)
        const requestBody = {
            startDate: startDate,         // 프론트엔드에서 받은 시작일
            endDate: endDate,           // 프론트엔드에서 받은 종료일
            timeUnit: validatedTimeUnit,  // 유효성 검사를 거친 시간 단위
            keywordGroups: keywords.map(kw => ({ // 각 키워드를 그룹으로 매핑
                groupName: kw,
                keywords: [kw]
            }))
            // device, gender, ages 등 다른 파라미터도 필요시 여기에 추가 가능
        };

        // 네이버 API 호출 (Node.js 내장 fetch 사용)
        const apiResponse = await fetch(naverApiUrl, {
            method: 'POST',
            headers: {
                'X-Naver-Client-Id': clientId,       // 네이버 클라이언트 ID 헤더
                'X-Naver-Client-Secret': clientSecret, // 네이버 클라이언트 시크릿 헤더
                'Content-Type': 'application/json'  // 요청 본문 타입 지정
            },
            body: JSON.stringify(requestBody) // 요청 본문을 JSON 문자열로 변환
        });

        // 네이버 API 응답 상태 확인 및 처리
        if (!apiResponse.ok) {
            let errorData;
            try {
                // 오류 응답 본문을 JSON으로 파싱 시도
                errorData = await apiResponse.json();
                console.error("Naver API Error Response:", errorData);
            } catch (e) {
                // JSON 파싱 실패 시 상태 텍스트 로깅
                console.error("Failed to parse Naver API error response:", apiResponse.statusText);
            }
            // 네이버에서 받은 오류 메시지 또는 상태 텍스트 사용
            const errorMessage = errorData?.errorMessage || apiResponse.statusText;
            const errorCode = errorData?.errorCode || apiResponse.status;
            // 네이버 API 오류를 클라이언트에게 좀 더 상세히 전달
             return res.status(apiResponse.status).json({ error: `네이버 API 오류: ${errorMessage} (코드: ${errorCode})` });
        }

        // 네이버 API 성공 응답 파싱
        const data = await apiResponse.json();
        // 성공 응답(200)과 함께 데이터를 프론트엔드로 전달
        res.status(200).json(data);

    } catch (error) {
        // 백엔드 함수 내부의 예외 처리
        console.error("Error in /api/analyze-trends:", error);
        // 일반적인 서버 오류 메시지를 클라이언트에게 전달
        res.status(500).json({ error: `데이터 분석 중 서버 오류 발생: ${error.message}` });
    }
}

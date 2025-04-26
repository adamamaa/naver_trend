# api/index.py (Vercel Serverless Function 파일 이름 예시)
from flask import Flask, request, jsonify
import requests
import os
# import random # 임의의 검색량 생성을 위해 임포트 (이제 DataLab 연동 시에는 사용하지 않음)
from flask_cors import CORS # CORS 설정을 위해 임포트 (프론트엔드와 백엔드가 다른 포트에서 실행될 경우 필요)
# 로컬 개발 시 .env 파일에서 환경 변수를 로드하기 위해 필요 (Vercel에서는 자동 로드)
from dotenv import load_dotenv
from datetime import datetime, timedelta # 현재 날짜 계산을 위해 임포트
import json # JSON 데이터 처리를 위해 임포트
import sys # 오류 로깅을 위해 sys 모듈 임포트

# 로컬 개발 환경에서 .env 파일 로드
# Vercel 배포 환경에서는 이 코드가 실행되지 않습니다.
load_dotenv()

# Flask 앱 생성
app = Flask(__name__)
# 프론트엔드와 백엔드가 다른 포트에서 실행될 경우 CORS 허용
# 실제 운영 환경에서는 특정 도메인만 허용하도록 설정하는 것이 안전합니다.
CORS(app)

# 네이버 API 정보 (Vercel 환경 변수 또는 로컬 .env 파일에서 불러옴)
# Vercel 프로젝트 설정에서 환경 변수(NAVER_CLIENT_ID, NAVER_CLIENT_SECRET)를 추가하세요.
# 또는 로컬 개발 시 프로젝트 루트에 .env 파일을 만들고 NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 값을 설정하세요.
NAVER_CLIENT_ID = os.environ.get('NAVER_CLIENT_ID')
NAVER_CLIENT_SECRET = os.environ.get('NAVER_CLIENT_SECRET')

# 네이버 블로그 검색 API 엔드포인트
NAVER_BLOG_SEARCH_URL = "https://openapi.naver.com/v1/search/blog.json"

# 네이버 데이터랩 통합 검색어 트렌드 API 엔드포인트
NAVER_DATALAB_SEARCH_URL = "https://openapi.naver.com/v1/datalab/search"

def get_naver_search_volume(keyword):
    """
    네이버 데이터랩 통합 검색어 트렌드 API를 사용하여 검색량 지표를 가져오는 함수.
    API는 상대적인 검색량 비율을 반환합니다. 여기서는 최근 월의 비율을 반환합니다.
    """
    # print(f"네이버 데이터랩 API로 '{keyword}'의 검색량 지표 가져오기 시도") # Removed print

    # 네이버 데이터랩 API 호출을 위한 헤더 설정
    headers = {
        'X-Naver-Client-Id': NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
        'Content-Type': 'application/json' # DataLab API는 JSON 본문 전송
    }

    # 조회 기간 설정 (예: 최근 3개월)
    end_date = datetime.now()
    # DataLab API는 조회 시작일을 2016년 1월 1일부터 지원
    # 검색량 지표는 최소 1개월 단위로 조회하는 것이 일반적입니다.
    # 최근 3개월 데이터를 조회하여 마지막 월의 비율을 사용합니다.
    start_date = end_date - timedelta(days=90) # 최근 90일 (약 3개월)
    # DataLab API는 startDate를YYYY-MM-DD 형식으로 요구
    start_date_str = start_date.strftime("%Y-%m-%d")
    end_date_str = end_date.strftime("%Y-%m-%d")


    # DataLab API 요청 본문 (Payload)
    # 통합 검색어 트렌드 API 문서에 따라 JSON 구조를 만듭니다.
    body = {
        "startDate": start_date_str, # 조회 기간 시작 날짜
        "endDate": end_date_str,     # 조회 기간 종료 날짜
        "timeUnit": "month",       # 시간 단위: 월간
        "keywordGroups": [
            {
                "groupName": keyword, # 그룹 이름 (키워드 자체 사용)
                "keywords": [keyword] # 분석할 키워드 목록
            }
        ],
        # device, gender, ages 등 필터링이 필요하면 여기에 추가
        # "device": "pc",
        # "gender": "m",
        # "ages": ["10", "20"]
    }

    try:
        # 네이버 데이터랩 API 호출 (POST 방식)
        # 요청 본문을 JSON 문자열로 변환하여 전송합니다.
        response = requests.post(NAVER_DATALAB_SEARCH_URL, headers=headers, data=json.dumps(body))
        response.raise_for_status() # HTTP 에러 발생 시 예외 throw

        # API 응답(JSON) 파싱
        datalab_data = response.json()

        # DataLab API 응답에서 검색량 지표 추출
        # 응답 구조: { "results": [ { "title": "...", "keywords": [...], "data": [ {"period": "...", "ratio": ...}, ... ] } ] }
        # keywordGroups에 키워드 하나만 넣었으므로 results[0]에 해당 키워드 데이터가 있습니다.
        # data 배열의 마지막 요소가 가장 최근 기간의 데이터입니다.
        search_ratio = 0.0 # 기본값 0

        if datalab_data and 'results' in datalab_data and len(datalab_data['results']) > 0:
            keyword_result = datalab_data['results'][0]
            if 'data' in keyword_result and len(keyword_result['data']) > 0:
                # data 배열의 마지막 요소 (가장 최근 기간)의 ratio 값을 가져옵니다.
                latest_data = keyword_result['data'][-1]
                search_ratio = latest_data.get('ratio', 0.0)
                # ratio 값은 float 형태입니다.

        # print(f"'{keyword}'의 최근 월 검색량 지표 (ratio): {search_ratio}", file=sys.stderr) # Changed to sys.stderr
        return search_ratio # 최근 월의 상대적 검색량 비율 반환

    except requests.exceptions.RequestException as e:
        # print(f"네이버 데이터랩 API 호출 오류: {e}", file=sys.stderr) # Changed to sys.stderr
        # 오류 발생 시 0을 반환합니다.
        return 0.0
    except Exception as e:
        # print(f"DataLab 응답 처리 중 오류: {e}", file=sys.stderr) # Changed to sys.stderr
        return 0.0


# Vercel Serverless Function으로 동작할 엔드포인트 정의
@app.route('/api/analyze-keyword', methods=['POST'])
def analyze_keyword():
    """
    프론트엔드로부터 키워드를 받아 네이버 블로그 발행량과 검색량 지표를 조회하고
    비율을 계산하여 반환하는 API 엔드포인트
    """
    # 네이버 API 키가 설정되지 않았는지 확인
    if not NAVER_CLIENT_ID or not NAVER_CLIENT_SECRET:
         # print('네이버 API 클라이언트 ID 또는 Secret이 설정되지 않았습니다.', file=sys.stderr) # Changed to sys.stderr
         # API 키 누락 시 더 명확한 JSON 에러 반환
         return jsonify({'error': 'Server configuration error: Naver API keys are not set. Please check Vercel Environment Variables.'}), 500

    # POST 요청의 JSON 본문에서 키워드 추출
    data = request.get_json()
    keyword = data.get('keyword')

    # 키워드가 없으면 에러 응답 반환
    if not keyword:
        return jsonify({'error': '키워드를 입력해주세요.'}), 400

    blog_count = 0
    search_volume_ratio = 0.0 # 검색량은 이제 상대적 비율 값입니다.
    ratio = 0.0

    try:
        # --- 1. 네이버 블로그 검색 API 호출 (발행량) ---
        headers = {
            'X-Naver-Client-Id': NAVER_CLIENT_ID,
            'X-Naver-Client-Secret': NAVER_CLIENT_SECRET
        }
        params = {
            'query': keyword, # 검색할 키워드
            'display': 1,     # 검색 결과 개수 (total 값만 필요하므로 1개만 요청)
            'start': 1        # 검색 시작 위치 (total 값에 영향 없음)
        }
        response = requests.get(NAVER_BLOG_SEARCH_URL, headers=headers, params=params)
        response.raise_for_status() # HTTP 에러 발생 시 예외 throw

        # API 응답(JSON) 파싱
        naver_data = response.json()

        # 블로그 발행량 (total 필드) 추출
        blog_count = naver_data.get('total', 0) # total 필드가 없으면 0으로 기본값 설정

        # --- 2. 검색량 지표 가져오기 (DataLab API 연동) ---
        # get_naver_search_volume 함수 내부에서 DataLab API를 호출합니다.
        search_volume_ratio = get_naver_search_volume(keyword) # 이제 상대적 비율 값 반환

        # --- 3. 비율 계산 ---
        # '검색량 지표 / 블로그 글 수' 비율 계산
        if blog_count > 0:
            ratio = search_volume_ratio / blog_count
            # 소수점 넷째 자리까지 표시하도록 반올림 (비율이 작을 수 있으므로)
            ratio = round(ratio, 4)
        else:
            # 블로그 글 수가 0이면 비율은 0으로 처리
            ratio = 0.0

        # --- 4. 프론트엔드로 보낼 결과 데이터 구성 ---
        result = {
            'keyword': keyword,
            'blogCount': blog_count,
            'searchVolume': search_volume_ratio, # 이제 상대적 검색량 비율 값
            'ratio': ratio
        }

        # 결과를 JSON 형태로 프론트엔드에 반환
        return jsonify(result)

    except requests.exceptions.RequestException as e:
        # API 호출 중 네트워크 또는 HTTP 에러 발생 시 (블로그 API 또는 DataLab API)
        # print(f"API 호출 오류: {e}", file=sys.stderr) # Changed to sys.stderr
        # 클라이언트에게 더 자세한 에러 메시지 전달
        return jsonify({'error': f'API 호출 중 오류가 발생했습니다: {e}'}), 500
    except Exception as e:
        # 그 외 예외 발생 시
        # print(f"백엔드 처리 중 오류: {e}", file=sys.stderr) # Changed to sys.stderr
        # 클라이언트에게 더 자세한 에러 메시지 전달
        return jsonify({'error': f'서버 내부 오류가 발생했습니다: {e}'}), 500

# Vercel Serverless Function으로 Flask 앱을 래핑
# Vercel 환경에서 실행될 때 이 부분이 사용됩니다.
# 로컬에서 일반 Flask 앱처럼 실행하려면 if __name__ == '__main__': 블록을 사용합니다.
vercel_app = Vercel(app)

# 로컬 개발용 실행 (선택 사항)
# Vercel 배포 시에는 이 블록은 실행되지 않습니다.
if __name__ == '__main__':
    # debug=True는 개발 중에만 사용하세요.
    # 로컬에서 실행 시 필요한 환경 변수를 .env 파일 등에 설정하고 python-dotenv 등으로 로드할 수 있습니다.
    app.run(debug=True, host='0.0.0.0', port=5000) # 예시로 5000번 포트 사용

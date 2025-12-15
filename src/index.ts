import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { InferenceClient } from '@huggingface/inference'

// Create server instance
const server = new McpServer({
    name: 'typescript-mcp-server',
    version: '1.0.0'
})

server.registerTool(
    'greet',
    {
        description: '이름과 언어를 입력하면 인사말을 반환합니다.',
        inputSchema: z.object({
            name: z.string().describe('인사할 사람의 이름'),
            language: z
                .enum(['ko', 'en'])
                .optional()
                .default('en')
                .describe('인사 언어 (기본값: en)')
        }),
        outputSchema: z.object({
            content: z
                .array(
                    z.object({
                        type: z.literal('text'),
                        text: z.string().describe('인사말')
                    })
                )
                .describe('인사말')
        })
    },
    async ({ name, language }) => {
        const greeting =
            language === 'ko'
                ? `안녕하세요, ${name}님!`
                : `Hey there, ${name}! 👋 Nice to meet you!`

        return {
            content: [
                {
                    type: 'text' as const,
                    text: greeting
                }
            ],
            structuredContent: {
                content: [
                    {
                        type: 'text' as const,
                        text: greeting
                    }
                ]
            }
        }
    }
)

server.registerTool(
    'calculator',
    {
        description: '두 개의 숫자와 연산자를 입력받아 사칙연산을 수행하고 결과를 반환합니다.',
        inputSchema: z.object({
            number1: z.number().describe('첫 번째 숫자'),
            number2: z.number().describe('두 번째 숫자'),
            operator: z
                .enum(['+', '-', '*', '/'])
                .describe('연산자 (+, -, *, /)')
        }),
        outputSchema: z.object({
            content: z
                .array(
                    z.object({
                        type: z.literal('text'),
                        text: z.string().describe('계산 결과')
                    })
                )
                .describe('계산 결과')
        })
    },
    async ({ number1, number2, operator }) => {
        let result: number
        let operation: string

        switch (operator) {
            case '+':
                result = number1 + number2
                operation = '덧셈'
                break
            case '-':
                result = number1 - number2
                operation = '뺄셈'
                break
            case '*':
                result = number1 * number2
                operation = '곱셈'
                break
            case '/':
                if (number2 === 0) {
                    throw new Error('0으로 나눌 수 없습니다.')
                }
                result = number1 / number2
                operation = '나눗셈'
                break
            default:
                throw new Error(`지원하지 않는 연산자입니다: ${operator}`)
        }

        const resultText = `${number1} ${operator} ${number2} = ${result} (${operation})`

        return {
            content: [
                {
                    type: 'text' as const,
                    text: resultText
                }
            ],
            structuredContent: {
                content: [
                    {
                        type: 'text' as const,
                        text: resultText
                    }
                ]
            }
        }
    }
)

server.registerTool(
    'time',
    {
        description: '타임존을 입력받아 해당 타임존의 현재 시간을 반환합니다.',
        inputSchema: z.object({
            timezone: z
                .string()
                .describe('IANA 타임존 이름 (예: Asia/Seoul, America/New_York, Europe/London)')
        }),
        outputSchema: z.object({
            content: z
                .array(
                    z.object({
                        type: z.literal('text'),
                        text: z.string().describe('현재 시간 정보')
                    })
                )
                .describe('현재 시간 정보')
        })
    },
    async ({ timezone }) => {
        try {
            const now = new Date()
            const formatter = new Intl.DateTimeFormat('ko-KR', {
                timeZone: timezone,
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            })

            const timeString = formatter.format(now)
            const resultText = `${timezone}의 현재 시간: ${timeString}`

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: resultText
                    }
                ],
                structuredContent: {
                    content: [
                        {
                            type: 'text' as const,
                            text: resultText
                        }
                    ]
                }
            }
        } catch (error) {
            throw new Error(`유효하지 않은 타임존입니다: ${timezone}. IANA 타임존 이름을 사용해주세요 (예: Asia/Seoul, America/New_York)`)
        }
    }
)

server.registerTool(
    'geocode',
    {
        description: '도시 이름이나 주소를 입력받아 위도와 경도 좌표를 반환합니다.',
        inputSchema: z.object({
            address: z
                .string()
                .describe('도시 이름 또는 주소 (예: "서울", "New York", "서울시 강남구")')
        }),
        outputSchema: z.object({
            content: z
                .array(
                    z.object({
                        type: z.literal('text'),
                        text: z.string().describe('위도와 경도 좌표 정보')
                    })
                )
                .describe('위도와 경도 좌표 정보')
        })
    },
    async ({ address }) => {
        try {
            // Nominatim API 엔드포인트
            const apiUrl = 'https://nominatim.openstreetmap.org/search'
            const params = new URLSearchParams({
                q: address,
                format: 'jsonv2',
                limit: '1',
                addressdetails: '1'
            })

            // User-Agent 헤더는 Nominatim 사용 정책에 따라 필수
            const response = await fetch(`${apiUrl}?${params.toString()}`, {
                headers: {
                    'User-Agent': 'MCP-Server/1.0.0'
                }
            })

            if (!response.ok) {
                throw new Error(`Nominatim API 요청 실패: ${response.status} ${response.statusText}`)
            }

            const data = await response.json()

            if (!data || data.length === 0) {
                throw new Error(`주소를 찾을 수 없습니다: ${address}`)
            }

            const result = data[0]
            const lat = parseFloat(result.lat)
            const lon = parseFloat(result.lon)
            const displayName = result.display_name || address

            const resultText = `주소: ${displayName}\n위도: ${lat}\n경도: ${lon}\n좌표: (${lat}, ${lon})`

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: resultText
                    }
                ],
                structuredContent: {
                    content: [
                        {
                            type: 'text' as const,
                            text: resultText
                        }
                    ]
                }
            }
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`지오코딩 실패: ${error.message}`)
            }
            throw new Error(`지오코딩 실패: 알 수 없는 오류가 발생했습니다.`)
        }
    }
)

server.registerTool(
    'get-weather',
    {
        description: '위도와 경도 좌표, 예보 기간을 입력받아 해당 위치의 현재 날씨와 예보 정보를 제공합니다.',
        inputSchema: z.object({
            latitude: z.number().min(-90).max(90).describe('위도 (-90 ~ 90)'),
            longitude: z.number().min(-180).max(180).describe('경도 (-180 ~ 180)'),
            forecastDays: z
                .number()
                .int()
                .min(1)
                .max(16)
                .optional()
                .default(7)
                .describe('예보 기간 (일 단위, 기본값: 7일, 최대: 16일)')
        }),
        outputSchema: z.object({
            content: z
                .array(
                    z.object({
                        type: z.literal('text'),
                        text: z.string().describe('날씨 정보')
                    })
                )
                .describe('날씨 정보')
        })
    },
    async ({ latitude, longitude, forecastDays = 7 }) => {
        try {
            // Open-Meteo API 엔드포인트
            const apiUrl = 'https://api.open-meteo.com/v1/forecast'
            const params = new URLSearchParams({
                latitude: latitude.toString(),
                longitude: longitude.toString(),
                current_weather: 'true',
                daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode',
                timezone: 'auto',
                forecast_days: forecastDays.toString()
            })

            const response = await fetch(`${apiUrl}?${params.toString()}`)

            if (!response.ok) {
                throw new Error(`Open-Meteo API 요청 실패: ${response.status} ${response.statusText}`)
            }

            const data = await response.json()

            if (!data || !data.current_weather) {
                throw new Error('날씨 데이터를 가져올 수 없습니다.')
            }

            const current = data.current_weather
            const daily = data.daily

            // 날씨 코드를 설명으로 변환하는 함수
            const getWeatherDescription = (code: number): string => {
                const weatherCodes: Record<number, string> = {
                    0: '맑음',
                    1: '대체로 맑음',
                    2: '부분적으로 흐림',
                    3: '흐림',
                    45: '안개',
                    48: '서리 안개',
                    51: '약한 이슬비',
                    53: '보통 이슬비',
                    55: '강한 이슬비',
                    56: '약한 동결 이슬비',
                    57: '강한 동결 이슬비',
                    61: '약한 비',
                    63: '보통 비',
                    65: '강한 비',
                    66: '약한 동결 비',
                    67: '강한 동결 비',
                    71: '약한 눈',
                    73: '보통 눈',
                    75: '강한 눈',
                    77: '눈알갱이',
                    80: '약한 소나기',
                    81: '보통 소나기',
                    82: '강한 소나기',
                    85: '약한 눈 소나기',
                    86: '강한 눈 소나기',
                    95: '뇌우',
                    96: '우박을 동반한 뇌우',
                    99: '강한 우박을 동반한 뇌우'
                }
                return weatherCodes[code] || `코드 ${code}`
            }

            // 현재 날씨 정보
            let resultText = `=== 현재 날씨 ===\n`
            resultText += `위치: 위도 ${latitude}, 경도 ${longitude}\n`
            resultText += `온도: ${current.temperature}°C\n`
            resultText += `날씨: ${getWeatherDescription(current.weathercode)}\n`
            resultText += `풍속: ${current.windspeed} km/h\n`
            resultText += `풍향: ${current.winddirection}°\n\n`

            // 일일 예보 정보
            resultText += `=== ${forecastDays}일 예보 ===\n`
            for (let i = 0; i < Math.min(forecastDays, daily.time.length); i++) {
                const date = new Date(daily.time[i])
                const dateStr = date.toLocaleDateString('ko-KR', {
                    month: 'long',
                    day: 'numeric',
                    weekday: 'short'
                })
                resultText += `\n${dateStr}:\n`
                resultText += `  최고온도: ${daily.temperature_2m_max[i]}°C\n`
                resultText += `  최저온도: ${daily.temperature_2m_min[i]}°C\n`
                resultText += `  강수량: ${daily.precipitation_sum[i]} mm\n`
                resultText += `  날씨: ${getWeatherDescription(daily.weathercode[i])}\n`
            }

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: resultText
                    }
                ],
                structuredContent: {
                    content: [
                        {
                            type: 'text' as const,
                            text: resultText
                        }
                    ]
                }
            }
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`날씨 정보 조회 실패: ${error.message}`)
            }
            throw new Error(`날씨 정보 조회 실패: 알 수 없는 오류가 발생했습니다.`)
        }
    }
)

server.registerTool(
    'generate-image',
    {
        description: '텍스트 프롬프트를 입력받아 AI 이미지를 생성합니다. FLUX.1-schnell 모델을 사용합니다.',
        inputSchema: z.object({
            prompt: z
                .string()
                .min(1)
                .max(1000)
                .describe('이미지 생성을 위한 텍스트 프롬프트 (영어 권장)')
        })
    },
    async ({ prompt }) => {
        try {
            const hfToken = process.env.HF_TOKEN
            if (!hfToken) {
                throw new Error('HF_TOKEN 환경 변수가 설정되지 않았습니다.')
            }

            const client = new InferenceClient(hfToken)

            const image = (await client.textToImage({
                provider: 'auto',
                model: 'black-forest-labs/FLUX.1-schnell',
                inputs: prompt,
                parameters: { num_inference_steps: 4 }
            })) as unknown as Blob

            // Blob을 Base64로 변환
            const arrayBuffer = await image.arrayBuffer()
            const base64Data = Buffer.from(arrayBuffer).toString('base64')

            return {
                content: [
                    {
                        type: 'image' as const,
                        data: base64Data,
                        mimeType: 'image/png'
                    }
                ]
            }
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`이미지 생성 실패: ${error.message}`)
            }
            throw new Error(`이미지 생성 실패: 알 수 없는 오류가 발생했습니다.`)
        }
    }
)

// 서버 정보
const serverInfo = {
    name: 'typescript-mcp-server',
    version: '1.0.0',
    description: 'TypeScript MCP 서버 - 다양한 유틸리티 도구 제공'
}

// 도구 정보 데이터
const toolsData = [
    {
        name: 'greet',
        description: '이름과 언어를 입력하면 인사말을 반환합니다.',
        parameters: {
            name: { type: 'string', description: '인사할 사람의 이름', required: true },
            language: { type: 'enum: ko, en', description: '인사 언어 (기본값: en)', required: false }
        }
    },
    {
        name: 'calculator',
        description: '두 개의 숫자와 연산자를 입력받아 사칙연산을 수행하고 결과를 반환합니다.',
        parameters: {
            number1: { type: 'number', description: '첫 번째 숫자', required: true },
            number2: { type: 'number', description: '두 번째 숫자', required: true },
            operator: { type: 'enum: +, -, *, /', description: '연산자 (+, -, *, /)', required: true }
        }
    },
    {
        name: 'time',
        description: '타임존을 입력받아 해당 타임존의 현재 시간을 반환합니다.',
        parameters: {
            timezone: { type: 'string', description: 'IANA 타임존 이름 (예: Asia/Seoul, America/New_York, Europe/London)', required: true }
        }
    },
    {
        name: 'geocode',
        description: '도시 이름이나 주소를 입력받아 위도와 경도 좌표를 반환합니다.',
        parameters: {
            address: { type: 'string', description: '도시 이름 또는 주소 (예: "서울", "New York", "서울시 강남구")', required: true }
        }
    },
    {
        name: 'get-weather',
        description: '위도와 경도 좌표, 예보 기간을 입력받아 해당 위치의 현재 날씨와 예보 정보를 제공합니다.',
        parameters: {
            latitude: { type: 'number', description: '위도 (-90 ~ 90)', required: true },
            longitude: { type: 'number', description: '경도 (-180 ~ 180)', required: true },
            forecastDays: { type: 'number', description: '예보 기간 (일 단위, 기본값: 7일, 최대: 16일)', required: false }
        }
    },
    {
        name: 'generate-image',
        description: '텍스트 프롬프트를 입력받아 AI 이미지를 생성합니다. FLUX.1-schnell 모델을 사용합니다.',
        parameters: {
            prompt: { type: 'string', description: '이미지 생성을 위한 텍스트 프롬프트 (영어 권장)', required: true }
        }
    }
]

// 코드 리뷰 프롬프트 템플릿
const codeReviewTemplate = (code: string, language?: string, focus?: string) => {
    const languageInfo = language ? `프로그래밍 언어: ${language}\n\n` : ''
    const focusInfo = focus ? `특별히 집중할 영역: ${focus}\n\n` : ''
    
    return `다음 코드를 리뷰해주세요. 코드 품질, 성능, 보안, 가독성, 유지보수성 관점에서 분석하고 개선점을 제안해주세요.

${languageInfo}${focusInfo}=== 리뷰할 코드 ===

\`\`\`${language || ''}
${code}
\`\`\`

=== 리뷰 요청 사항 ===

1. 코드 품질 및 표준 준수 여부
   - 코딩 컨벤션 준수 여부
   - 네이밍 규칙 적절성
   - 코드 구조 및 설계 패턴

2. 성능 최적화 가능성
   - 알고리즘 효율성
   - 불필요한 연산이나 중복 코드
   - 메모리 사용 최적화

3. 보안 취약점
   - 입력 검증 및 검사
   - 인젝션 공격 가능성
   - 인증 및 권한 관리

4. 가독성 및 유지보수성
   - 코드 주석 및 문서화
   - 함수/클래스 분리 적절성
   - 테스트 가능성

5. 개선 제안
   - 구체적인 개선 방안
   - 리팩토링 제안
   - 베스트 프랙티스 적용

각 항목에 대해 구체적인 예시와 함께 설명해주세요.`
}

// 프롬프트 등록 - 코드 리뷰
server.registerPrompt(
    'code-review',
    {
        title: '코드 리뷰',
        description: '코드를 입력받아 코드 리뷰를 위한 프롬프트를 생성합니다.',
        argsSchema: {
            code: z.string().describe('리뷰할 코드'),
            language: z
                .string()
                .optional()
                .describe('프로그래밍 언어 (예: TypeScript, JavaScript, Python, Java 등)'),
            focus: z
                .string()
                .optional()
                .describe('특별히 집중할 리뷰 영역 (예: 성능, 보안, 가독성 등)')
        }
    },
    async ({ code, language, focus }) => {
        const promptText = codeReviewTemplate(code, language, focus)
        
        return {
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: promptText
                    }
                }
            ]
        }
    }
)

// 리소스 등록 - 서버 정보와 도구 목록
server.registerResource(
    '서버 정보',
    'server://info',
    {
        description: '현재 MCP 서버의 정보와 사용 가능한 도구 목록',
        mimeType: 'application/json'
    },
    async () => {
        const serverInfoData = {
            server: {
                name: serverInfo.name,
                version: serverInfo.version,
                description: serverInfo.description,
                startedAt: new Date().toISOString(),
                uptime: typeof process !== 'undefined' ? process.uptime() : 0
            },
            tools: toolsData,
            totalTools: toolsData.length,
            capabilities: {
                tools: true,
                resources: true,
                prompts: true
            }
        }

        return {
            contents: [
                {
                    uri: 'server://info',
                    mimeType: 'application/json',
                    text: JSON.stringify(serverInfoData, null, 2)
                }
            ]
        }
    }
)

server
    .connect(new StdioServerTransport())
    .catch(console.error)
    .then(() => {
        console.log('MCP server started')
    })

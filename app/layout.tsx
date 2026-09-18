import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title:"重科青廉课堂 · 大学第一课", description:"重庆科技大学新生廉洁教育课堂互动", icons:{icon:"/favicon.svg"}, robots:{index:false,follow:false}};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="zh-CN"><body>{children}</body></html>}

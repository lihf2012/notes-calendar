// 从 Markdown 提取纯文本摘要
export function extractSummary(markdown: string, maxLen = 80): string {
  if (!markdown) return '暂无内容'
  const text = markdown
    .replace(/^#{1,6}\s+/gm, '')       // 标题标记
    .replace(/\*\*(.+?)\*\*/g, '$1')    // 粗体
    .replace(/\*(.+?)\*/g, '$1')         // 斜体
    .replace(/`(.+?)`/g, '$1')           // 行内代码
    .replace(/```[\s\S]*?```/g, '[代码]') // 代码块
    .replace(/!\[.*?\]\(.*?\)/g, '[图片]') // 图片
    .replace(/\[(.+?)\]\(.*?\)/g, '$1')  // 链接
    .replace(/>\s+.*/g, '')              // 引用
    .replace(/[-*+]\s+/g, '')            // 列表
    .replace(/\n{2,}/g, '\n')            // 多空行
    .replace(/\n/g, ' ')
    .trim()
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text
}

// 估算阅读时间（分钟）
export function readingTime(markdown: string): number {
  const text = markdown.replace(/[#*`>\-]/g, '')
  const words = text.length / 2 // 中文按字符算
  return Math.max(1, Math.ceil(words / 300))
}

// 生成默认标题（取首行）
export function extractTitle(markdown: string): string {
  if (!markdown) return '无标题'
  const firstLine = markdown.split('\n').find((l) => l.trim())
  if (!firstLine) return '无标题'
  return firstLine.replace(/^#{1,6}\s+/, '').replace(/[*`]/g, '').slice(0, 50)
}

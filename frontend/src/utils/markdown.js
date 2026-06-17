const escapeHtml = (text) => {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

const generateId = (text) => {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const parseInline = (text) => {
  text = escapeHtml(text)
  
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>')
  text = text.replace(/`(.+?)`/g, '<code>$1</code>')
  text = text.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  
  return text
}

const parseMarkdown = (markdown) => {
  if (!markdown) return ''
  
  const lines = markdown.split('\n')
  let html = ''
  let inCodeBlock = false
  let codeLang = ''
  let codeContent = ''
  let inList = false
  let listType = null
  let inBlockquote = false
  let inTable = false
  let tableHeader = ''
  let tableBody = ''
  let tableAlign = []

  const closeList = () => {
    if (inList) {
      if (listType === 'ul') {
        html += '</ul>\n'
      } else {
        html += '</ol>\n'
      }
      inList = false
      listType = null
    }
  }

  const closeBlockquote = () => {
    if (inBlockquote) {
      html += '</blockquote>\n'
      inBlockquote = false
    }
  }

  const closeTable = () => {
    if (inTable) {
      html += '<table><thead>' + tableHeader + '</thead><tbody>' + tableBody + '</tbody></table>\n'
      inTable = false
      tableHeader = ''
      tableBody = ''
      tableAlign = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]

    if (inCodeBlock) {
      if (line.trim().startsWith('```')) {
        html += `<pre><code class="language-${codeLang}">${escapeHtml(codeContent)}</code></pre>\n`
        inCodeBlock = false
        codeLang = ''
        codeContent = ''
      } else {
        codeContent += line + '\n'
      }
      continue
    }

    if (line.trim().startsWith('```')) {
      closeList()
      closeBlockquote()
      closeTable()
      inCodeBlock = true
      codeLang = line.trim().slice(3).trim()
      continue
    }

    const hMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (hMatch) {
      closeList()
      closeBlockquote()
      closeTable()
      const level = hMatch[1].length
      const text = hMatch[2].trim()
      const id = generateId(text)
      html += `<h${level} id="${id}">${parseInline(text)}</h${level}>\n`
      continue
    }

    if (line.trim() === '---' || line.trim() === '***') {
      closeList()
      closeBlockquote()
      closeTable()
      html += '<hr/>\n'
      continue
    }

    const bqMatch = line.match(/^>\s?(.*)$/)
    if (bqMatch) {
      closeList()
      closeTable()
      if (!inBlockquote) {
        html += '<blockquote>\n'
        inBlockquote = true
      }
      html += `<p>${parseInline(bqMatch[1])}</p>\n`
      continue
    } else {
      closeBlockquote()
    }

    const ulMatch = line.match(/^[-*+]\s+(.+)$/)
    const olMatch = line.match(/^\d+\.\s+(.+)$/)
    
    if (ulMatch || olMatch) {
      closeTable()
      const currentType = ulMatch ? 'ul' : 'ol'
      const text = ulMatch ? ulMatch[1] : olMatch[1]
      
      if (!inList || listType !== currentType) {
        closeList()
        if (currentType === 'ul') {
          html += '<ul>\n'
        } else {
          html += '<ol>\n'
        }
        inList = true
        listType = currentType
      }
      html += `<li>${parseInline(text)}</li>\n`
      continue
    } else {
      closeList()
    }

    if (line.includes('|') && line.trim().startsWith('|')) {
      const cells = line.trim().split('|').filter(c => c.trim() !== '')
      
      if (!inTable) {
        inTable = true
        tableHeader = '<tr>' + cells.map(c => `<th>${parseInline(c.trim())}</th>`).join('') + '</tr>'
        continue
      } else if (tableAlign.length === 0 && cells.every(c => /^:?-+:?$/.test(c.trim()))) {
        tableAlign = cells.map(c => {
          const t = c.trim()
          if (t.startsWith(':') && t.endsWith(':')) return 'center'
          if (t.endsWith(':')) return 'right'
          return 'left'
        })
        continue
      } else {
        tableBody += '<tr>' + cells.map((c, idx) => {
          const align = tableAlign[idx] || 'left'
          return `<td style="text-align: ${align}">${parseInline(c.trim())}</td>`
        }).join('') + '</tr>'
        continue
      }
    } else {
      closeTable()
    }

    if (line.trim() === '') {
      continue
    }

    html += `<p>${parseInline(line)}</p>\n`
  }

  closeList()
  closeBlockquote()
  closeTable()

  return html
}

const extractHeadings = (markdown) => {
  if (!markdown) return []
  
  const lines = markdown.split('\n')
  const headings = []

  for (const line of lines) {
    const hMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (hMatch) {
      const level = hMatch[1].length
      const text = hMatch[2].trim()
      const id = generateId(text)
      headings.push({ level, text, id })
    }
  }

  return headings
}

const highlightKeyword = (html, keyword) => {
  if (!keyword || !html) return html
  
  const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  return html.replace(regex, '<mark class="search-highlight">$1</mark>')
}

export { parseMarkdown, extractHeadings, generateId, highlightKeyword }

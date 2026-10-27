import type { AdminPageVo } from '../../types/admin'

/** 后端分页上限 100；合并页面只拉一次全量再在前端筛选/计数。设上限防止异常数据拖垮页面 */
export const FETCH_PAGE_SIZE = 100
export const FETCH_MAX_PAGES = 20

export const fetchAllPages = async <T>(
  fetchPage: (page: number, size: number) => Promise<AdminPageVo<T>>,
): Promise<{ items: T[]; truncated: boolean }> => {
  const items: T[] = []
  for (let page = 0; page < FETCH_MAX_PAGES; page += 1) {
    const result = await fetchPage(page, FETCH_PAGE_SIZE)
    const content = result.content ?? []
    items.push(...content)
    const totalPages = result.totalPages ?? (result.totalElements != null
      ? Math.ceil(result.totalElements / FETCH_PAGE_SIZE) : 1)
    if (content.length < FETCH_PAGE_SIZE || page + 1 >= totalPages) {
      return { items, truncated: false }
    }
  }
  return { items, truncated: true }
}

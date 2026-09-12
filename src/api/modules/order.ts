// 1B-5b（Q6/Q7=A）：旧「航线→下单」流程（/order/create、/order/list 等用户端接口）已随
// OrderView 重做为管理端视图而移除，运营端订单查询统一走 admin-query.ts（/admin/orders）。
// 本模块仅保留跨模块共享的 BizError（auth/live/uav/admin-query 等模块的错误类型）。
export class BizError extends Error {
  errorCode: string
  constructor(errorCode: string, message: string) {
    super(message)
    this.name = 'BizError'
    this.errorCode = errorCode
  }
}

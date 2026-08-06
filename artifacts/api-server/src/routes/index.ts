import { Router, type IRouter } from "express";
import healthRouter from "./health";
import cxRouter from "./cx";
import { requireCxUser } from "../middlewares/cxAuth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireCxUser);
router.use(cxRouter);

export default router;

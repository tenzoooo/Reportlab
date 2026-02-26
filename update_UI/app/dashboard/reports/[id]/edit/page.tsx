import { redirect } from "next/navigation"

type Props = {
  params: {
    id: string
  }
}

export default function ReportEditPage({ params }: Props) {
  redirect(`/dashboard/reports/${params.id}`)
}

"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { User, Mail, School, BookOpen, Calendar, Award, Camera } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

export default function ProfilePage() {
  const [isEditing, setIsEditing] = useState(false)
  const [userData, setUserData] = useState({
    name: "山田 太郎",
    email: "yamada.taro@example.com",
    university: "東京工業大学",
    department: "工学部 電気電子工学科",
    studentId: "2021001",
    joinDate: "2024年4月",
  })

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        staggerChildren: 0.1,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
  }

  const stats = [
    { label: "総レポート数", value: 15, icon: BookOpen, color: "text-blue-600" },
    { label: "今月作成", value: 3, icon: Award, color: "text-green-600" },
    { label: "利用日数", value: 45, icon: Calendar, color: "text-purple-600" },
  ]

  const recentActivity = [
    { title: "実験1のレポート", date: "2024/10/28", type: "作成" },
    { title: "実験2のレポート", date: "2024/10/27", type: "作成" },
    { title: "実験3のレポート", date: "2024/10/26", type: "作成" },
  ]

  return (
    <div className="min-h-screen bg-background">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        className="max-w-6xl mx-auto p-4 sm:p-6 space-y-8"
      >
        {/* Header */}
        <motion.div variants={itemVariants}>
          <h1 className="text-3xl font-bold text-foreground">プロフィール</h1>
          <p className="text-muted-foreground mt-2">アカウント情報と利用統計</p>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Profile Card */}
          <motion.div variants={itemVariants} className="lg:col-span-1">
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center space-y-4">
                  {/* Avatar */}
                  <div className="relative">
                    <div className="h-32 w-32 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                      <User className="h-16 w-16 text-white" />
                    </div>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="absolute bottom-0 right-0 h-10 w-10 rounded-full shadow-md"
                    >
                      <Camera className="h-5 w-5" />
                    </Button>
                  </div>

                  {/* User Info */}
                  <div className="text-center space-y-1">
                    <h2 className="text-2xl font-bold text-foreground">{userData.name}</h2>
                    <p className="text-sm text-muted-foreground">{userData.email}</p>
                  </div>

                  {/* Stats */}
                  <div className="w-full pt-4 border-t space-y-3">
                    {stats.map((stat) => (
                      <div key={stat.label} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <stat.icon className={`h-5 w-5 ${stat.color}`} />
                          <span className="text-sm text-muted-foreground">{stat.label}</span>
                        </div>
                        <span className="text-lg font-bold text-foreground">{stat.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Plan Badge */}
                  <div className="w-full pt-4 border-t">
                    <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-4 py-2 rounded-lg text-center">
                      <p className="text-sm font-semibold">Premium プラン</p>
                      <p className="text-xs opacity-90">すべての機能が利用可能</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Storage Card */}
            <motion.div variants={itemVariants} className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">ストレージ使用量</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">使用中</span>
                      <span className="font-semibold text-foreground">245 MB / 1 GB</span>
                    </div>
                    <Progress value={24} className="h-2" />
                  </div>
                  <p className="text-xs text-muted-foreground">まだ755MBの空き容量があります</p>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>

          {/* Right Column - Details */}
          <div className="lg:col-span-2 space-y-6">
            <motion.div variants={itemVariants}>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>プロフィール情報</CardTitle>
                    <CardDescription>基本情報の確認と編集</CardDescription>
                  </div>
                  <Button variant={isEditing ? "secondary" : "default"} onClick={() => setIsEditing(!isEditing)}>
                    {isEditing ? "キャンセル" : "編集"}
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {/* Personal Info */}
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name" className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          名前
                        </Label>
                        <Input
                          id="name"
                          value={userData.name}
                          disabled={!isEditing}
                          onChange={(e) => setUserData({ ...userData, name: e.target.value })}
                          className={!isEditing ? "bg-muted" : ""}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="email" className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          メールアドレス
                        </Label>
                        <Input
                          id="email"
                          type="email"
                          value={userData.email}
                          disabled={!isEditing}
                          onChange={(e) => setUserData({ ...userData, email: e.target.value })}
                          className={!isEditing ? "bg-muted" : ""}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="university" className="flex items-center gap-2">
                          <School className="h-4 w-4 text-muted-foreground" />
                          大学名
                        </Label>
                        <Input
                          id="university"
                          value={userData.university}
                          disabled={!isEditing}
                          onChange={(e) => setUserData({ ...userData, university: e.target.value })}
                          className={!isEditing ? "bg-muted" : ""}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="department" className="flex items-center gap-2">
                          <BookOpen className="h-4 w-4 text-muted-foreground" />
                          学部・学科
                        </Label>
                        <Input
                          id="department"
                          value={userData.department}
                          disabled={!isEditing}
                          onChange={(e) => setUserData({ ...userData, department: e.target.value })}
                          className={!isEditing ? "bg-muted" : ""}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="studentId" className="flex items-center gap-2">
                          <Award className="h-4 w-4 text-muted-foreground" />
                          学籍番号
                        </Label>
                        <Input
                          id="studentId"
                          value={userData.studentId}
                          disabled={!isEditing}
                          onChange={(e) => setUserData({ ...userData, studentId: e.target.value })}
                          className={!isEditing ? "bg-muted" : ""}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="joinDate" className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          登録日
                        </Label>
                        <Input id="joinDate" value={userData.joinDate} disabled className="bg-muted" />
                      </div>
                    </div>

                    {isEditing && (
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsEditing(false)}>
                          キャンセル
                        </Button>
                        <Button onClick={() => setIsEditing(false)}>保存</Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Recent Activity */}
            <motion.div variants={itemVariants}>
              <Card>
                <CardHeader>
                  <CardTitle>最近のアクティビティ</CardTitle>
                  <CardDescription>直近の操作履歴</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {recentActivity.map((activity, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-center justify-between p-4 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <BookOpen className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">{activity.title}</p>
                            <p className="text-sm text-muted-foreground">{activity.type}</p>
                          </div>
                        </div>
                        <span className="text-sm text-muted-foreground">{activity.date}</span>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
